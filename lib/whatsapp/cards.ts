// Review cards: an interactive button message per draft, with an optional
// image header. Button ids carry the draft revision so a stale tap can be
// told apart from a current one.

import type { DraftRecord } from "@/lib/drafts/records";
import { draftMeta } from "@/lib/studio/view-model";
import { recipientFields, textMessage, type WhatsAppOutbound } from "@/lib/whatsapp/cloud-api";

export type HarpyAction =
  | { readonly verb: "approve" | "skip" | "edit"; readonly draftId: string; readonly revision: number }
  | { readonly verb: "review"; readonly ideaId: string };

const ACTION_ID_MAX = 256;
const DRAFT_VERBS: ReadonlySet<string> = new Set(["approve", "skip", "edit"]);

export function harpyActionId(action: HarpyAction): string {
  return action.verb === "review"
    ? `harpy:review:${action.ideaId}`
    : `harpy:${action.verb}:${action.draftId}:${action.revision}`;
}

export function parseHarpyActionId(raw: string): HarpyAction | null {
  if (raw.length > ACTION_ID_MAX || !raw.startsWith("harpy:")) return null;
  const [, verb, ...rest] = raw.split(":");

  if (verb === "review") {
    const ideaId = rest.join(":");
    return ideaId ? { verb, ideaId } : null;
  }

  if (verb && DRAFT_VERBS.has(verb) && rest.length === 2) {
    const [draftId, revisionText] = rest as [string, string];
    if (!draftId || !/^\d+$/.test(revisionText)) return null;
    const revision = Number(revisionText);
    if (!Number.isSafeInteger(revision) || revision < 1) return null;
    return { verb: verb as "approve" | "skip" | "edit", draftId, revision };
  }

  return null;
}

export const CARD_BODY_MAX = 1024;
export const CARD_FOOTER_MAX = 60;
const CARD_EXCERPT_CHARS = 900;
const CARD_EXCERPT_SUFFIX = "…\n\n(Full text above.)";

export type CardDraft = Pick<DraftRecord, "id" | "revision" | "platform" | "posts" | "text" | "scheduledAt">;
export type CardMessage = { readonly kind: "card" | "full_text"; readonly message: WhatsAppOutbound };

function cardBody(draft: CardDraft): string {
  const posts = draft.posts.length > 0 ? draft.posts : [draft.text];
  if (posts.length === 1) return posts[0]!;
  return posts.map((post, index) => `${index + 1}/${posts.length} ${post}`).join("\n\n");
}

// The first 900 characters, cut back to the last whitespace when there is one.
function excerpt(body: string): string {
  const head = body.slice(0, CARD_EXCERPT_CHARS);
  const cut = head.search(/\s\S*$/);
  return (cut > 0 ? head.slice(0, cut) : head).trimEnd();
}

export function reviewCardMessages(input: {
  readonly waId: string;
  readonly draft: CardDraft;
  readonly imageUrl: string | null;
  readonly timezone: string;
}): CardMessage[] {
  const { waId, draft, imageUrl, timezone } = input;
  const full = cardBody(draft);
  const tooLong = full.length > CARD_BODY_MAX;
  const text = tooLong ? `${excerpt(full)}${CARD_EXCERPT_SUFFIX}` : full;
  const button = (verb: "approve" | "edit" | "skip", title: string) => ({
    type: "reply",
    reply: { id: harpyActionId({ verb, draftId: draft.id, revision: draft.revision }), title },
  });

  const card: WhatsAppOutbound = {
    ...recipientFields(waId),
    type: "interactive",
    interactive: {
      type: "button",
      ...(imageUrl ? { header: { type: "image", image: { link: imageUrl } } } : {}),
      body: { text },
      footer: { text: draftMeta(draft, timezone).slice(0, CARD_FOOTER_MAX) },
      action: { buttons: [button("approve", "Approve"), button("edit", "Edit"), button("skip", "Skip")] },
    },
  };

  return tooLong
    ? [
        { kind: "full_text", message: textMessage(waId, full) },
        { kind: "card", message: card },
      ]
    : [{ kind: "card", message: card }];
}
