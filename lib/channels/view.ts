import type { ChannelIdentityKind, LinkedIdentity } from "@/lib/db/channel-identities";
import type { NotifyResult } from "@/lib/whatsapp/deliver";

export type LinkedRow = {
  readonly id: string;
  readonly channel: ChannelIdentityKind;
  readonly label: string;
  readonly linkedOn: string;
};

// The unlink confirmation on the Channels page. A number in
// HARPY_WHATSAPP_ALLOWED_NUMBERS links itself again, so WhatsApp says so.
export const UNLINK_CONFIRM: Readonly<
  Record<ChannelIdentityKind, { readonly title: string; readonly body: string; readonly confirm: string }>
> = {
  whatsapp: {
    title: "Unlink this number?",
    body: "harpy will stop answering this number. A number in HARPY_WHATSAPP_ALLOWED_NUMBERS links itself again on its next message, so remove it there too.",
    confirm: "Unlink",
  },
  slack: {
    title: "Unlink this Slack account?",
    body: "harpy will stop answering this Slack account until you link it again.",
    confirm: "Unlink",
  },
};

const LINKED_ON = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function label(identity: LinkedIdentity): string {
  if (identity.channel === "slack") {
    // Slack external ids are "<team>:<user>".
    return `Slack user ${identity.externalId.split(":").pop()}`;
  }

  const digits = identity.phone ?? identity.externalId;
  return /^\d+$/.test(digits) ? `+${digits}` : (identity.bsuid ?? digits);
}

export function linkedRow(identity: LinkedIdentity): LinkedRow {
  return {
    id: identity.id,
    channel: identity.channel,
    label: label(identity),
    linkedOn: LINKED_ON.format(new Date(identity.linkedAt)),
  };
}

export function sendToWhatsAppMessage(result: NotifyResult): string {
  if (result.ok) {
    if (result.delivery === "duplicate") return "Those cards were already sent.";
    if (result.delivery === "template") {
      return "Sent a notification to WhatsApp. Tap Review there to see the cards.";
    }

    return `Sent ${result.sent} ${result.sent === 1 ? "card" : "cards"} to WhatsApp.`;
  }

  if (result.reason === "nothing_to_review") return "Nothing here is waiting for review.";
  if (result.reason === "not_configured") return "WhatsApp isn't set up yet.";

  return result.message;
}
