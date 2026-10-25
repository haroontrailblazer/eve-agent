import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationRecord } from "@/lib/notify/types";

const mocks = vi.hoisted(() => ({
  findWaMessage: vi.fn(),
  findNotificationByProviderMessageId: vi.fn(),
  claimTemplateFallback: vi.fn(),
  markNotificationSent: vi.fn(),
  markNotificationFailed: vi.fn(),
  sendDraftsReadyTemplate: vi.fn(),
}));

vi.mock("@/lib/notify/store", () => ({
  findWaMessage: mocks.findWaMessage,
  findNotificationByProviderMessageId: mocks.findNotificationByProviderMessageId,
  claimTemplateFallback: mocks.claimTemplateFallback,
  markNotificationSent: mocks.markNotificationSent,
  markNotificationFailed: mocks.markNotificationFailed,
}));
vi.mock("@/lib/whatsapp/deliver", () => ({ sendDraftsReadyTemplate: mocks.sendDraftsReadyTemplate }));

const { verifyMetaSignature, extractStatuses, handleStatuses } = await import("@/lib/whatsapp/statuses");

const SECRET = "app-secret";

function sign(body: string, secret = SECRET): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

const notification = { id: "n1", brandId: "b1", recipient: "15551234567" } as NotificationRecord;
const failed131047 = { wamid: "wamid.card", status: "failed", recipient: "15551234567", errorCode: 131047 } as const;

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("verifyMetaSignature", () => {
  const body = '{"entry":[]}';

  it("accepts a correct signature", () => {
    expect(verifyMetaSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body, a wrong secret, a missing header and malformed headers", () => {
    expect(verifyMetaSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body, "other"), SECRET)).toBe(false);
    expect(verifyMetaSignature(body, null, SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "sha256=abc", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, "garbage", SECRET)).toBe(false);
    expect(verifyMetaSignature(body, sign(body).replace("sha256=", ""), SECRET)).toBe(false);
  });
});

describe("extractStatuses", () => {
  it("reads failed and read statuses from a Meta payload", () => {
    const payload = {
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.a", status: "failed", recipient_id: "1555", errors: [{ code: 131047 }] },
                  { id: "wamid.b", status: "read", recipient_id: "1555" },
                ],
              },
            },
            { field: "other", value: { statuses: [{ id: "wamid.c", status: "failed", recipient_id: "1" }] } },
          ],
        },
      ],
    };
    expect(extractStatuses(payload)).toEqual([
      { wamid: "wamid.a", status: "failed", recipient: "1555", errorCode: 131047 },
      { wamid: "wamid.b", status: "read", recipient: "1555", errorCode: null },
    ]);
  });

  it("tolerates missing arrays and junk", () => {
    expect(extractStatuses(null)).toEqual([]);
    expect(extractStatuses({})).toEqual([]);
    expect(extractStatuses({ entry: [{}, { changes: [{ field: "messages", value: {} }] }] })).toEqual([]);
    expect(
      extractStatuses({ entry: [{ changes: [{ field: "messages", value: { statuses: [{ status: "sent" }] } }] }] }),
    ).toEqual([]);
  });
});

describe("handleStatuses", () => {
  it("sends the template once for a card that failed with 131047", async () => {
    mocks.findWaMessage.mockResolvedValue({ brandId: "b1", draftId: "d1", revision: 1, kind: "card", notificationId: "n1" });
    mocks.claimTemplateFallback.mockResolvedValueOnce(notification).mockResolvedValueOnce(null);
    mocks.sendDraftsReadyTemplate.mockResolvedValue({ ok: true, wamid: "wamid.tpl" });

    await handleStatuses([failed131047]);
    await handleStatuses([failed131047]);

    expect(mocks.sendDraftsReadyTemplate).toHaveBeenCalledTimes(1);
    expect(mocks.sendDraftsReadyTemplate).toHaveBeenCalledWith(notification);
    expect(mocks.markNotificationSent).toHaveBeenCalledTimes(1);
    expect(mocks.markNotificationSent).toHaveBeenCalledWith({ id: "n1", delivery: "template", providerMessageId: "wamid.tpl" });
  });

  it("marks the notification failed when the template send fails", async () => {
    mocks.findWaMessage.mockResolvedValue({ brandId: "b1", draftId: "d1", revision: 1, kind: "full_text", notificationId: "n1" });
    mocks.claimTemplateFallback.mockResolvedValue(notification);
    mocks.sendDraftsReadyTemplate.mockResolvedValue({ ok: false, code: 100, windowClosed: false, message: "nope" });

    await handleStatuses([failed131047]);

    expect(mocks.markNotificationSent).not.toHaveBeenCalled();
    expect(mocks.markNotificationFailed).toHaveBeenCalledWith({ id: "n1", error: "nope" });
  });

  it("fails the notification for a template wamid", async () => {
    mocks.findWaMessage.mockResolvedValue(null);
    mocks.findNotificationByProviderMessageId.mockResolvedValue(notification);

    await handleStatuses([{ wamid: "wamid.tpl", status: "failed", recipient: "1", errorCode: 131026 }]);

    expect(mocks.markNotificationFailed).toHaveBeenCalledWith({ id: "n1", error: "WhatsApp error 131026" });
    expect(mocks.sendDraftsReadyTemplate).not.toHaveBeenCalled();
  });

  it("writes nothing for other failures", async () => {
    mocks.findWaMessage.mockResolvedValue({ brandId: "b1", draftId: "d1", revision: 1, kind: "card", notificationId: "n1" });
    mocks.findNotificationByProviderMessageId.mockResolvedValue(null);

    await handleStatuses([{ ...failed131047, errorCode: 131026 }]);
    mocks.findWaMessage.mockResolvedValue(null);
    await handleStatuses([{ ...failed131047, wamid: "wamid.unknown" }]);

    expect(mocks.claimTemplateFallback).not.toHaveBeenCalled();
    expect(mocks.markNotificationFailed).not.toHaveBeenCalled();
    expect(mocks.markNotificationSent).not.toHaveBeenCalled();
  });

  it("makes no store calls for sent, delivered and read", async () => {
    await handleStatuses([
      { wamid: "a", status: "sent", recipient: "1", errorCode: null },
      { wamid: "b", status: "delivered", recipient: "1", errorCode: null },
      { wamid: "c", status: "read", recipient: "1", errorCode: null },
    ]);
    for (const mock of Object.values(mocks)) expect(mock).not.toHaveBeenCalled();
  });
});
