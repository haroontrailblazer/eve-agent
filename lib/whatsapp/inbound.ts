import type { AuthResult } from "eve/channels/auth";
import { resolveChannelAuth } from "@/lib/channel-auth";
import { getDraft } from "@/lib/drafts/store";
import { parseLinkCommand, redeemLinkCode } from "@/lib/link-codes";
import { findWaMessage } from "@/lib/notify/store";
import { PLATFORMS } from "@/lib/platforms";
import { getRedis } from "@/lib/redis";
import { requestRevision } from "@/lib/review";
import { isBsuid, sendWhatsApp, textMessage } from "@/lib/whatsapp/cloud-api";
import { COPY } from "@/lib/whatsapp/copy";
import { sendReviewCards } from "@/lib/whatsapp/deliver";
import { reviewFailureReply, takePendingEdit } from "@/lib/whatsapp/review";
import { transcribeVoiceNote } from "@/lib/whatsapp/transcribe";
import { touchWindow } from "@/lib/whatsapp/window";

export const WHATSAPP_INBOUND_PER_10_MIN = 30;
const INBOUND_WINDOW_SECONDS = 600;
const VOICE_PLACEHOLDERS = new Set(["[Audio message]", "[Voice message]"]);
const VOICE_CONTEXT = "The owner sent this as a voice note. The text is its transcript.";

export type InboundAttachment = {
  readonly type: "image" | "file" | "video" | "audio";
  readonly mimeType?: string;
  readonly name?: string;
  readonly fetchData?: () => Promise<Buffer | ArrayBuffer>;
};

export type InboundMessage = {
  readonly id: string;
  readonly waId: string;
  readonly phone: string | null;
  readonly bsuid: string | null;
  readonly text: string;
  readonly attachments: readonly InboundAttachment[];
  readonly quotedWamid: string | null;
};

export type InboundPlan =
  | { readonly kind: "ignore" }
  | { readonly kind: "reply"; readonly text: string; readonly cardDraftId?: string; readonly brandId?: string }
  | { readonly kind: "reset"; readonly auth: AuthResult }
  | {
      readonly kind: "turn";
      readonly auth: AuthResult;
      readonly text: string;
      readonly attachments: readonly InboundAttachment[];
      readonly context: readonly string[];
    };

// The collaborators planInbound and runInbound call. Tests pass fakes.
export type InboundDeps = {
  readonly resolveAuth: typeof resolveChannelAuth;
  readonly redeemLinkCode: typeof redeemLinkCode;
  readonly getRedis: typeof getRedis;
  readonly touchWindow: typeof touchWindow;
  readonly takePendingEdit: typeof takePendingEdit;
  readonly findWaMessage: typeof findWaMessage;
  readonly requestRevision: typeof requestRevision;
  readonly getDraft: typeof getDraft;
  readonly transcribe: typeof transcribeVoiceNote;
  readonly send: typeof sendWhatsApp;
  readonly sendReviewCards: typeof sendReviewCards;
  readonly now: () => Date;
};

const REAL_DEPS: InboundDeps = {
  resolveAuth: resolveChannelAuth,
  redeemLinkCode,
  getRedis,
  touchWindow,
  takePendingEdit,
  findWaMessage,
  requestRevision,
  getDraft,
  transcribe: transcribeVoiceNote,
  send: sendWhatsApp,
  sendReviewCards,
  now: () => new Date(),
};

export function toInboundMessage(message: {
  readonly id: string;
  readonly text: string;
  readonly author: { readonly userId: string };
  readonly attachments?: readonly InboundAttachment[];
  readonly raw?: unknown;
}): InboundMessage {
  const raw = (message.raw ?? {}) as {
    contact?: { wa_id?: unknown };
    userId?: unknown;
    message?: { context?: { id?: unknown } };
  };
  const authorId = message.author.userId;
  const contactId = raw.contact?.wa_id;
  const phone = typeof contactId === "string" && contactId ? contactId : /^\d+$/.test(authorId) ? authorId : null;
  const bsuid = typeof raw.userId === "string" && isBsuid(raw.userId) ? raw.userId : null;
  const quoted = raw.message?.context?.id;

  return {
    id: message.id,
    waId: authorId,
    phone,
    bsuid,
    text: message.text,
    attachments: message.attachments ?? [],
    quotedWamid: typeof quoted === "string" && quoted ? quoted : null,
  };
}

function editInstruction(label: string, draftId: string): string {
  return `This message is the change the owner wants to the ${label} draft ${draftId}. Call revise_draft with draftId "${draftId}" and the owner's words as the instruction, then call submit_for_review with draftIds ["${draftId}"]. Draft nothing else.`;
}

// "notice" is the one over-limit message that gets a reply; later ones are silent.
async function checkRateLimit(waId: string, deps: InboundDeps): Promise<"ok" | "notice" | "silent"> {
  const redis = deps.getRedis();
  if (!redis) return "ok";

  const windowId = Math.floor(deps.now().getTime() / (INBOUND_WINDOW_SECONDS * 1000));
  const key = `wa:inbound:${waId}:${windowId}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, INBOUND_WINDOW_SECONDS);
  if (count === WHATSAPP_INBOUND_PER_10_MIN + 1) return "notice";
  return count > WHATSAPP_INBOUND_PER_10_MIN ? "silent" : "ok";
}

// The pending marker wins; otherwise the card the owner replied to, when it is
// one of this brand's.
async function findEditTarget(
  message: InboundMessage,
  brandId: string,
  deps: InboundDeps,
): Promise<{ draftId: string; revision: number; label: string } | null> {
  const pending = await deps.takePendingEdit(message.waId);
  if (pending) {
    return { draftId: pending.draftId, revision: pending.revision, label: PLATFORMS[pending.platform].label };
  }

  if (!message.quotedWamid) return null;
  const quoted = await deps.findWaMessage(message.quotedWamid);
  if (!quoted || quoted.brandId !== brandId) return null;
  const draft = await deps.getDraft(brandId, quoted.draftId);
  if (!draft) return null;
  return { draftId: quoted.draftId, revision: quoted.revision, label: PLATFORMS[draft.platform].label };
}

export async function planInbound(message: InboundMessage, overrides: Partial<InboundDeps> = {}): Promise<InboundPlan> {
  const deps: InboundDeps = { ...REAL_DEPS, ...overrides };
  const { waId, phone, bsuid } = message;
  const identity = { channel: "whatsapp", externalId: waId, phone, bsuid, extraAttributes: { waId } } as const;

  // 1. Link command. A stranger gets an answer only to a correct code.
  const code = parseLinkCommand(message.text);
  if (code) {
    const redeemed = await deps.redeemLinkCode({ channel: "whatsapp", externalId: waId, code, phone, bsuid });
    if (redeemed.ok) return { kind: "reply", text: COPY.linked(redeemed.email) };
    return (await deps.resolveAuth(identity)) ? { kind: "reply", text: COPY.linkFailed } : { kind: "ignore" };
  }

  // 2. Unknown sender: silence.
  const auth = await deps.resolveAuth(identity);
  if (!auth) return { kind: "ignore" };

  // 3. Rate limit.
  const limit = await checkRateLimit(waId, deps);
  if (limit === "notice") return { kind: "reply", text: COPY.rateLimited };
  if (limit === "silent") return { kind: "ignore" };

  // 4. Window.
  await deps.touchWindow(waId);

  // 5. Reset.
  if (message.text.trim().toLowerCase() === "/new") return { kind: "reset", auth };

  // 6. Attachments: locations and stickers carry nothing the agent can use.
  let attachments = message.attachments.filter(
    (attachment) => attachment.mimeType !== "application/geo+json" && attachment.name !== "sticker",
  );
  if (attachments.length === 0 && message.text === "[Sticker]") return { kind: "ignore" };

  let text = message.text;
  const context: string[] = [];

  // 7. Voice.
  const audio = attachments.find((attachment) => attachment.type === "audio");
  if (audio) {
    try {
      if (!audio.fetchData) throw new Error("The voice note has no data.");
      const transcript = await deps.transcribe(new Uint8Array(await audio.fetchData()));
      text = VOICE_PLACEHOLDERS.has(text) ? transcript : `${text}\n${transcript}`;
    } catch (error) {
      console.warn("whatsapp: voice note transcription failed", error instanceof Error ? error.message : error);
      return { kind: "reply", text: COPY.voiceFailed };
    }
    attachments = attachments.filter((attachment) => attachment !== audio);
    context.push(VOICE_CONTEXT);
  }

  // 8. Edit target.
  const brandAttribute = auth.attributes?.brandId;
  const brandId = typeof brandAttribute === "string" ? brandAttribute : undefined;
  const target = brandId ? await findEditTarget(message, brandId, deps) : null;
  if (brandId && target) {
    const revision = await deps.requestRevision({
      brandId,
      draftId: target.draftId,
      expectedRevision: target.revision,
    });
    if (!revision.ok) {
      const failure = reviewFailureReply({
        reason: revision.reason,
        current: revision.draft,
        revision: target.revision,
      });
      // Only a repeated tap is silent; an edit reply always gets an answer.
      if (failure.kind === "silent") return { kind: "ignore" };
      return {
        kind: "reply",
        text: failure.text,
        brandId,
        ...(failure.card ? { cardDraftId: failure.card.id } : {}),
      };
    }
    context.push(editInstruction(target.label, target.draftId));
  }

  // 9. Turn.
  return { kind: "turn", auth, text, attachments, context };
}

export async function runInbound(
  message: InboundMessage,
  effects: {
    readonly startTurn: (plan: Extract<InboundPlan, { kind: "turn" }>) => Promise<void>;
    readonly resetSession: () => Promise<boolean>;
  },
  overrides: Partial<InboundDeps> = {},
): Promise<void> {
  const deps: InboundDeps = { ...REAL_DEPS, ...overrides };
  const plan = await planInbound(message, deps);

  switch (plan.kind) {
    case "ignore":
      return;
    case "reply": {
      await deps.send(textMessage(message.waId, plan.text));
      if (plan.cardDraftId && plan.brandId) {
        const draft = await deps.getDraft(plan.brandId, plan.cardDraftId);
        if (draft) {
          await deps.sendReviewCards({
            brandId: plan.brandId,
            waId: message.waId,
            drafts: [draft],
            notificationId: null,
          });
        }
      }
      return;
    }
    case "reset": {
      if (await effects.resetSession()) {
        await deps.send(textMessage(message.waId, COPY.reset));
      } else {
        console.warn("whatsapp: /new found no session to reset");
      }
      return;
    }
    case "turn":
      await effects.startTurn(plan);
  }
}
