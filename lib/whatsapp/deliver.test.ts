import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRecord } from "@/lib/drafts/records";

const mocks = vi.hoisted(() => ({
  getWhatsAppConfig: vi.fn(),
  listDraftsForIdea: vi.fn(),
  getIdea: vi.fn(),
  getMediaAsset: vi.fn(),
  getBrandSettings: vi.fn(),
  insertNotification: vi.fn(),
  claimFailedNotification: vi.fn(),
  markNotificationSent: vi.fn(),
  markNotificationFailed: vi.fn(),
  recordWaMessage: vi.fn(),
  sendWhatsApp: vi.fn(),
  isWindowOpen: vi.fn(),
}));

vi.mock("@/lib/whatsapp/config", () => ({ getWhatsAppConfig: mocks.getWhatsAppConfig }));
vi.mock("@/lib/drafts/store", () => ({ listDraftsForIdea: mocks.listDraftsForIdea, getIdea: mocks.getIdea }));
vi.mock("@/lib/media/assets", () => ({ getMediaAsset: mocks.getMediaAsset }));
vi.mock("@/lib/db/brands", () => ({ getBrandSettings: mocks.getBrandSettings }));
vi.mock("@/lib/notify/store", () => ({
  insertNotification: mocks.insertNotification,
  claimFailedNotification: mocks.claimFailedNotification,
  markNotificationSent: mocks.markNotificationSent,
  markNotificationFailed: mocks.markNotificationFailed,
  recordWaMessage: mocks.recordWaMessage,
}));
vi.mock("@/lib/whatsapp/window", () => ({ isWindowOpen: mocks.isWindowOpen }));
vi.mock("@/lib/whatsapp/cloud-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/cloud-api")>()),
  sendWhatsApp: mocks.sendWhatsApp,
}));

const { notifyDraftsReady, sendReviewCards } = await import("@/lib/whatsapp/deliver");

function draft(id: string, status: DraftRecord["status"], mediaIds: string[] = []): DraftRecord {
  return {
    id,
    ideaId: "i1",
    brandId: "b1",
    platform: "linkedin",
    status,
    revision: 2,
    hook: "hook",
    text: `text of ${id}`,
    posts: [],
    mediaIds,
    imagePrompt: null,
    scheduledAt: null,
    approvedAt: null,
    approvedVia: null,
    notes: "",
    revisionRequestedAt: null,
    externalUrl: null,
    createdAt: "2026-10-25T09:00:00.000Z",
    updatedAt: "2026-10-25T09:00:00.000Z",
  };
}

const DRAFTS = [draft("d1", "pending_review"), draft("d2", "pending_review"), draft("d3", "approved")];
const NOTIFICATION = {
  id: "n1",
  brandId: "b1",
  channel: "whatsapp",
  recipient: "1555",
  kind: "drafts_ready",
  dedupeKey: "k",
  payload: { kind: "drafts_ready", ideaId: "i1", drafts: [] },
  status: "pending",
  delivery: null,
  providerMessageId: null,
  attempts: 0,
  lastError: null,
  createdAt: "2026-10-25T09:00:00.000Z",
};
const input = { brandId: "b1", waId: "1555", ideaId: "i1" };
const SEND_FAILED = "Couldn't reach WhatsApp. Try again in a minute.";

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getWhatsAppConfig.mockReturnValue({ phoneNumberId: "p" });
  mocks.listDraftsForIdea.mockResolvedValue(DRAFTS);
  mocks.getIdea.mockResolvedValue({ id: "i1", text: "Small teams\nship faster" });
  mocks.getBrandSettings.mockResolvedValue({ timezone: "Asia/Kolkata", name: "b" });
  mocks.getMediaAsset.mockResolvedValue(null);
  mocks.insertNotification.mockImplementation(async (arg: { payload: unknown }) => ({
    created: true,
    notification: { ...NOTIFICATION, payload: arg.payload },
  }));
  mocks.isWindowOpen.mockResolvedValue(true);
  let count = 0;
  mocks.sendWhatsApp.mockImplementation(async () => ({ ok: true, wamid: `wamid.${++count}` }));
});

describe("notifyDraftsReady", () => {
  it("reports not_configured without inserting", async () => {
    mocks.getWhatsAppConfig.mockReturnValue(null);
    const result = await notifyDraftsReady(input);
    expect(result).toMatchObject({ ok: false, reason: "not_configured" });
    expect(mocks.insertNotification).not.toHaveBeenCalled();
  });

  it("reports nothing_to_review when every draft is approved", async () => {
    mocks.listDraftsForIdea.mockResolvedValue([draft("d3", "approved")]);
    const result = await notifyDraftsReady(input);
    expect(result).toMatchObject({ ok: false, reason: "nothing_to_review" });
    expect(mocks.insertNotification).not.toHaveBeenCalled();
  });

  it("keeps only the requested drafts", async () => {
    await notifyDraftsReady({ ...input, draftIds: ["d2"] });
    expect(mocks.insertNotification.mock.calls[0][0].payload.drafts).toEqual([{ id: "d2", revision: 2 }]);
  });

  it("sends review cards when the window is open", async () => {
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: true, delivery: "cards", sent: 2 });
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(mocks.recordWaMessage).toHaveBeenCalledTimes(2);
    expect(mocks.recordWaMessage).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "card", notificationId: "n1", wamid: "wamid.1", draftId: "d1", revision: 2 }),
    );
    expect(mocks.markNotificationSent).toHaveBeenCalledWith({
      id: "n1",
      delivery: "service",
      providerMessageId: "wamid.2",
    });
  });

  it("builds a dedupe key from the idea and draft revisions", async () => {
    await notifyDraftsReady(input);
    const hash = createHash("sha256").update("1555|i1|d1@2,d2@2").digest("hex");
    expect(mocks.insertNotification.mock.calls[0][0]).toMatchObject({
      brandId: "b1",
      recipient: "1555",
      kind: "drafts_ready",
      dedupeKey: `drafts_ready:${hash}`,
      payload: {
        kind: "drafts_ready",
        ideaId: "i1",
        drafts: [
          { id: "d1", revision: 2 },
          { id: "d2", revision: 2 },
        ],
      },
    });
  });

  it("changes the dedupe key with a resendKey", async () => {
    await notifyDraftsReady(input);
    await notifyDraftsReady({ ...input, resendKey: "again" });
    const [first, second] = mocks.insertNotification.mock.calls.map(([arg]) => arg.dedupeKey);
    expect(first).not.toBe(second);
  });

  it("returns duplicate without sending", async () => {
    mocks.insertNotification.mockResolvedValue({ created: false, notification: NOTIFICATION });
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: true, delivery: "duplicate", sent: 0 });
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("re-sends a failed notification on its own row", async () => {
    const failed = { ...NOTIFICATION, id: "n0", status: "failed", payload: { kind: "drafts_ready", ideaId: "i1", drafts: [] } };
    mocks.insertNotification.mockResolvedValue({ created: false, notification: failed });
    mocks.claimFailedNotification.mockResolvedValue({ ...failed, status: "pending" });
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: true, delivery: "cards", sent: 2 });
    expect(mocks.claimFailedNotification).toHaveBeenCalledWith("n0");
    expect(mocks.recordWaMessage).toHaveBeenCalledWith(expect.objectContaining({ notificationId: "n0" }));
    expect(mocks.markNotificationSent).toHaveBeenCalledWith(expect.objectContaining({ id: "n0", delivery: "service" }));
  });

  it("keeps a sent notification a duplicate without claiming", async () => {
    mocks.insertNotification.mockResolvedValue({ created: false, notification: { ...NOTIFICATION, status: "sent" } });
    expect(await notifyDraftsReady(input)).toEqual({ ok: true, delivery: "duplicate", sent: 0 });
    expect(mocks.claimFailedNotification).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("is a duplicate when another request claimed the failed notification", async () => {
    mocks.insertNotification.mockResolvedValue({ created: false, notification: { ...NOTIFICATION, status: "failed" } });
    mocks.claimFailedNotification.mockResolvedValue(null);
    expect(await notifyDraftsReady(input)).toEqual({ ok: true, delivery: "duplicate", sent: 0 });
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("marks the notification failed when a send throws", async () => {
    mocks.sendWhatsApp.mockRejectedValue(new Error("network down"));
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: false, reason: "send_failed", message: SEND_FAILED });
    expect(mocks.markNotificationFailed).toHaveBeenCalledWith({ id: "n1", error: "network down" });
  });

  it("sends the template when the window is closed", async () => {
    mocks.isWindowOpen.mockResolvedValue(false);
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: true, delivery: "template", sent: 1 });
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1);
    const message = mocks.sendWhatsApp.mock.calls[0][0];
    expect(message.template.name).toBe("harpy_drafts_ready");
    expect(message.template.components[0].parameters[0].text).toBe("2");
    expect(message.template.components[0].parameters[1].text).toBe("Small teams ship faster");
    expect(message.template.components[1].parameters[0].payload).toBe("harpy:review:i1");
    expect(mocks.markNotificationSent).toHaveBeenCalledWith({
      id: "n1",
      delivery: "template",
      providerMessageId: "wamid.1",
    });
  });

  it("falls back to the template when Meta rejects a card with 131047", async () => {
    mocks.sendWhatsApp
      .mockResolvedValueOnce({ ok: false, code: 131047, windowClosed: true, message: "re-engage" })
      .mockResolvedValueOnce({ ok: true, wamid: "wamid.t" });
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: true, delivery: "template", sent: 1 });
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(2);
    expect(mocks.markNotificationSent).toHaveBeenCalledWith({
      id: "n1",
      delivery: "template",
      providerMessageId: "wamid.t",
    });
  });

  it("fails when a card fails for another reason", async () => {
    mocks.sendWhatsApp.mockResolvedValueOnce({ ok: false, code: 100, windowClosed: false, message: "bad" });
    const result = await notifyDraftsReady(input);
    expect(result).toEqual({ ok: false, reason: "send_failed", message: SEND_FAILED });
    expect(mocks.markNotificationFailed).toHaveBeenCalledWith({ id: "n1", error: "bad" });
    expect(mocks.markNotificationSent).not.toHaveBeenCalled();
  });

  it("fails when the template send fails", async () => {
    mocks.isWindowOpen.mockResolvedValue(false);
    mocks.sendWhatsApp.mockResolvedValue({ ok: false, code: 132000, windowClosed: false, message: "template" });
    const result = await notifyDraftsReady(input);
    expect(result).toMatchObject({ ok: false, reason: "send_failed", message: SEND_FAILED });
    expect(mocks.markNotificationFailed).toHaveBeenCalledWith({ id: "n1", error: "template" });
  });
});

describe("sendReviewCards", () => {
  const cards = (drafts: DraftRecord[]) =>
    sendReviewCards({ brandId: "b1", waId: "1555", drafts, notificationId: null });

  it("adds an image header from the draft's own brand", async () => {
    mocks.getMediaAsset.mockResolvedValue({ id: "m1", brandId: "b1", blobUrl: "https://blob/x.png" });
    await cards([draft("d1", "pending_review", ["m1"])]);
    expect(mocks.sendWhatsApp.mock.calls[0][0].interactive.header).toEqual({
      type: "image",
      image: { link: "https://blob/x.png" },
    });
  });

  it("ignores media that belongs to another brand", async () => {
    mocks.getMediaAsset.mockResolvedValue({ id: "m1", brandId: "other", blobUrl: "https://blob/x.png" });
    await cards([draft("d1", "pending_review", ["m1"])]);
    expect(mocks.sendWhatsApp.mock.calls[0][0].interactive.header).toBeUndefined();
  });

  it("falls back to UTC for an invalid time zone", async () => {
    mocks.getBrandSettings.mockResolvedValue({ timezone: "Not/AZone", name: "b" });
    const outcome = await cards([draft("d1", "pending_review")]);
    expect(outcome).toEqual({ sent: 1, windowClosed: false, error: null, lastWamid: "wamid.1" });
  });

  it("stops at the first failure and reports a closed window", async () => {
    mocks.sendWhatsApp.mockResolvedValueOnce({ ok: false, code: 131047, windowClosed: true, message: "x" });
    const outcome = await cards([draft("d1", "pending_review"), draft("d2", "pending_review")]);
    expect(outcome).toEqual({ sent: 0, windowClosed: true, error: null, lastWamid: null });
    expect(mocks.sendWhatsApp).toHaveBeenCalledTimes(1);
  });
});
