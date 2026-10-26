// Button taps on review cards and the drafts template. A tap changes a draft
// through plain code, with no model turn.

import { resolveChannelAuth } from "@/lib/channel-auth";
import type { DraftRecord } from "@/lib/drafts/records";
import { canApply } from "@/lib/drafts/state";
import { getDraft, listDraftsForIdea } from "@/lib/drafts/store";
import type { DraftState, SocialPlatform } from "@/lib/drafts/types";
import { PLATFORMS } from "@/lib/platforms";
import { getRedis } from "@/lib/redis";
import { approveDraft, type ReviewFailure, reviewFailureMessage, skipDraft } from "@/lib/review";
import { type HarpyAction, parseHarpyActionId } from "@/lib/whatsapp/cards";
import { sendWhatsApp, textMessage } from "@/lib/whatsapp/cloud-api";
import { COPY } from "@/lib/whatsapp/copy";
import { sendReviewCards } from "@/lib/whatsapp/deliver";
import { touchWindow } from "@/lib/whatsapp/window";

export const EDIT_MARKER_TTL_SECONDS = 1_800;
const TAP_TTL_SECONDS = 86_400;

export type PendingEdit = {
  readonly draftId: string;
  readonly revision: number;
  readonly platform: SocialPlatform;
};

function editKey(waId: string): string {
  return `wa:edit:${waId}`;
}

export async function setPendingEdit(waId: string, edit: PendingEdit): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(editKey(waId), JSON.stringify(edit), { ex: EDIT_MARKER_TTL_SECONDS });
}

// getdel makes the marker single use: the next message consumes it.
export async function takePendingEdit(waId: string): Promise<PendingEdit | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.getdel<PendingEdit | string>(editKey(waId));
  if (raw === null || raw === undefined) return null;

  try {
    const value = (typeof raw === "string" ? JSON.parse(raw) : raw) as Partial<PendingEdit> | null;
    if (!value || typeof value.draftId !== "string" || typeof value.revision !== "number" || !value.platform) {
      return null;
    }
    return { draftId: value.draftId, revision: value.revision, platform: value.platform };
  } catch {
    return null;
  }
}

// WhatsApp redelivers webhooks, so each delivery of a tap runs once. A second
// tap on the same button has its own id; reviewFailureReply keeps it quiet.
// Without Redis taps are processed without dedupe.
export async function claimTap(tapId: string): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;
  const claimed = await redis.set(`wa:tap:${tapId}`, "1", { nx: true, ex: TAP_TTL_SECONDS });
  return claimed !== null;
}

async function reply(waId: string, body: string): Promise<void> {
  await sendWhatsApp(textMessage(waId, body));
}

export type ReviewFailureReply =
  | { readonly kind: "silent" }
  | { readonly kind: "reply"; readonly text: string; readonly card: DraftRecord | null };

// What a failed tap or edit reply tells the owner. A repeat of a tap that
// already worked gets nothing. A draft that has moved on says where it is. Only
// a draft still waiting for review, now at a newer revision, gets its card.
export function reviewFailureReply(input: {
  readonly reason: ReviewFailure;
  readonly current: DraftRecord | null;
  readonly revision: number;
  // The state the tap sets: "approved" for Approve, "skipped" for Skip.
  readonly tapTarget?: DraftState;
}): ReviewFailureReply {
  const { reason, current, revision, tapTarget } = input;
  if (!current) return { kind: "reply", text: reviewFailureMessage("not_found"), card: null };
  if (tapTarget && current.revision === revision && current.status === tapTarget) return { kind: "silent" };

  switch (current.status) {
    case "pending_review":
      return { kind: "reply", text: reviewFailureMessage(reason), card: current };
    case "approved":
      return { kind: "reply", text: COPY.alreadyApproved, card: null };
    case "skipped":
      return { kind: "reply", text: COPY.alreadySkipped, card: null };
    default:
      return { kind: "reply", text: reviewFailureMessage("invalid_state"), card: null };
  }
}

async function replyFailure(brandId: string, waId: string, failure: ReviewFailureReply): Promise<void> {
  if (failure.kind === "silent") return;
  await reply(waId, failure.text);
  if (failure.card) {
    await sendReviewCards({ brandId, waId, drafts: [failure.card], notificationId: null });
  }
}

export async function handleHarpyAction(input: {
  readonly action: HarpyAction;
  readonly tapId: string;
  readonly waId: string;
  readonly brandId: string;
}): Promise<void> {
  const { action, tapId, waId, brandId } = input;
  if (!(await claimTap(tapId))) return;
  await touchWindow(waId);

  if (action.verb === "review") {
    const drafts = (await listDraftsForIdea(brandId, action.ideaId)).filter((d) => d.status === "pending_review");
    if (drafts.length === 0) {
      await reply(waId, COPY.nothingToReview);
      return;
    }
    await sendReviewCards({ brandId, waId, drafts, notificationId: null });
    return;
  }

  const { draftId, revision } = action;

  if (action.verb === "edit") {
    const current = await getDraft(brandId, draftId);
    if (current && current.revision === revision && canApply("edit", current.status)) {
      await setPendingEdit(waId, { draftId, revision, platform: current.platform });
      await reply(waId, COPY.editPrompt(PLATFORMS[current.platform].label));
      return;
    }
    const reason: ReviewFailure = !current ? "not_found" : current.revision !== revision ? "stale" : "invalid_state";
    await replyFailure(brandId, waId, reviewFailureReply({ reason, current, revision }));
    return;
  }

  const target = { brandId, draftId, expectedRevision: revision, expectedStatus: "pending_review" } as const;
  const result =
    action.verb === "approve" ? await approveDraft({ ...target, via: "whatsapp" }) : await skipDraft(target);

  if (result.ok) {
    const label = PLATFORMS[result.draft.platform].label;
    await reply(waId, action.verb === "approve" ? COPY.approved(label) : COPY.skipped(label));
    return;
  }

  const tapTarget = action.verb === "approve" ? "approved" : "skipped";
  await replyFailure(
    brandId,
    waId,
    reviewFailureReply({ reason: result.reason, current: result.draft, revision, tapTarget }),
  );
}

// What the channel calls for every tap. Senders with no linked identity get
// silence.
export async function handleIncomingAction(input: {
  readonly actionId: string;
  readonly tapId: string;
  readonly waId: string;
  readonly phone: string | null;
}): Promise<void> {
  const action = parseHarpyActionId(input.actionId);
  if (!action) return;

  const auth = await resolveChannelAuth({
    channel: "whatsapp",
    externalId: input.waId,
    phone: input.phone,
    extraAttributes: { waId: input.waId },
  });
  const rawBrandId = auth?.attributes?.brandId;
  const brandId = typeof rawBrandId === "string" ? rawBrandId : null;
  if (!brandId) return;

  await handleHarpyAction({ action, tapId: input.tapId, waId: input.waId, brandId });
}
