import { getDraft } from "@/lib/drafts/store";
import { notifyDraftsReady } from "@/lib/whatsapp/deliver";

export type SubmitForReviewInput = {
  readonly brandId: string;
  readonly channel: string | null;
  readonly waId: string | null;
  readonly ideaId?: string;
  readonly draftIds?: readonly string[];
  readonly resendKey?: string;
};

export type SubmitForReviewResult =
  | {
      readonly ok: true;
      readonly delivery: "studio" | "cards" | "template" | "duplicate";
      readonly sent: number;
      readonly message: string;
    }
  | { readonly ok: false; readonly message: string };

const TEMPLATE_MESSAGE =
  "WhatsApp only allows a template message right now, so harpy sent a notification. The owner taps Review to see the cards.";

// On WhatsApp, sends one review card per pending draft. Elsewhere the drafts
// are already in Studio, so it only confirms that.
export async function submitForReview(
  input: SubmitForReviewInput,
  deps: Partial<{ notifyDraftsReady: typeof notifyDraftsReady; getDraft: typeof getDraft }> = {},
): Promise<SubmitForReviewResult> {
  if (input.channel !== "whatsapp") {
    return { ok: true, delivery: "studio", sent: 0, message: "The drafts are in Studio." };
  }
  if (!input.waId) {
    return { ok: false, message: "This WhatsApp session has no number to send to." };
  }

  const notify = deps.notifyDraftsReady ?? notifyDraftsReady;
  const load = deps.getDraft ?? getDraft;

  // One notification per idea, each with the draft ids that belong to it.
  const groups = new Map<string, string[] | undefined>();
  if (input.draftIds) {
    for (const draftId of input.draftIds) {
      const found = await load(input.brandId, draftId);
      if (!found) continue;
      groups.set(found.ideaId, [...(groups.get(found.ideaId) ?? []), draftId]);
    }
  } else if (input.ideaId) {
    groups.set(input.ideaId, undefined);
  }

  if (groups.size === 0) {
    return { ok: false, message: "There are no drafts waiting for review." };
  }

  let sent = 0;
  const deliveries: string[] = [];
  for (const [ideaId, draftIds] of groups) {
    const result = await notify({
      brandId: input.brandId,
      waId: input.waId,
      ideaId,
      draftIds,
      resendKey: input.resendKey,
    });
    if (!result.ok) return { ok: false, message: result.message };
    sent += result.sent;
    deliveries.push(result.delivery);
  }

  if (deliveries.includes("template")) {
    return { ok: true, delivery: "template", sent, message: TEMPLATE_MESSAGE };
  }
  if (deliveries.every((delivery) => delivery === "duplicate")) {
    return { ok: true, delivery: "duplicate", sent, message: "Those cards were already sent." };
  }
  return { ok: true, delivery: "cards", sent, message: `Sent ${sent} review card${sent === 1 ? "" : "s"}.` };
}
