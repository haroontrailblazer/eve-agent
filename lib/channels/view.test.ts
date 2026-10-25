import { describe, expect, it } from "vitest";
import type { LinkedIdentity } from "@/lib/db/channel-identities";
import { linkedRow, sendToWhatsAppMessage } from "@/lib/channels/view";

function identity(overrides: Partial<LinkedIdentity>): LinkedIdentity {
  return {
    id: "ci-1",
    userId: "user-1",
    brandId: "brand-1",
    channel: "whatsapp",
    externalId: "15551234567",
    phone: "15551234567",
    bsuid: null,
    email: "a@example.com",
    name: null,
    linkedAt: "2026-10-25T23:30:00.000Z",
    ...overrides,
  };
}

describe("linkedRow", () => {
  it("labels a whatsapp number with a plus and the digits", () => {
    expect(linkedRow(identity({}))).toEqual({
      id: "ci-1",
      channel: "whatsapp",
      label: "+15551234567",
      linkedOn: "Oct 25",
    });
  });

  it("falls back to the bsuid when there is no phone", () => {
    expect(linkedRow(identity({ phone: null, bsuid: "US.abc", externalId: "US.abc" })).label).toBe("US.abc");
  });

  it("labels a slack user by the user id part", () => {
    expect(linkedRow(identity({ channel: "slack", externalId: "T1:U1", phone: null })).label).toBe("Slack user U1");
  });

  it("formats the linked date in UTC", () => {
    expect(linkedRow(identity({ linkedAt: "2026-01-02T00:00:00.000Z" })).linkedOn).toBe("Jan 2");
  });
});

describe("sendToWhatsAppMessage", () => {
  it("reads each result", () => {
    expect(sendToWhatsAppMessage({ ok: true, delivery: "cards", sent: 1 })).toBe("Sent 1 card to WhatsApp.");
    expect(sendToWhatsAppMessage({ ok: true, delivery: "cards", sent: 3 })).toBe("Sent 3 cards to WhatsApp.");
    expect(sendToWhatsAppMessage({ ok: true, delivery: "template", sent: 1 })).toBe(
      "Sent a notification to WhatsApp. Tap Review there to see the cards.",
    );
    expect(sendToWhatsAppMessage({ ok: true, delivery: "duplicate", sent: 0 })).toBe("Those cards were already sent.");
    expect(sendToWhatsAppMessage({ ok: false, reason: "nothing_to_review", message: "x" })).toBe(
      "Nothing here is waiting for review.",
    );
    expect(sendToWhatsAppMessage({ ok: false, reason: "not_configured", message: "x" })).toBe(
      "WhatsApp isn't set up yet.",
    );
    expect(sendToWhatsAppMessage({ ok: false, reason: "send_failed", message: "Meta said no." })).toBe("Meta said no.");
  });
});
