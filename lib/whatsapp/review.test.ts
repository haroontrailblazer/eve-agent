import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRecord } from "@/lib/drafts/records";

const mocks = vi.hoisted(() => ({
  approveDraft: vi.fn(),
  skipDraft: vi.fn(),
  getDraft: vi.fn(),
  listDraftsForIdea: vi.fn(),
  sendWhatsApp: vi.fn(),
  sendReviewCards: vi.fn(),
  touchWindow: vi.fn(),
  resolveChannelAuth: vi.fn(),
  redis: {
    set: vi.fn(),
    getdel: vi.fn(),
  },
  hasRedis: true,
}));

vi.mock("@/lib/review", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/review")>()),
  approveDraft: mocks.approveDraft,
  skipDraft: mocks.skipDraft,
}));
vi.mock("@/lib/drafts/store", () => ({ getDraft: mocks.getDraft, listDraftsForIdea: mocks.listDraftsForIdea }));
vi.mock("@/lib/whatsapp/cloud-api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/cloud-api")>()),
  sendWhatsApp: mocks.sendWhatsApp,
}));
vi.mock("@/lib/whatsapp/deliver", () => ({ sendReviewCards: mocks.sendReviewCards }));
vi.mock("@/lib/whatsapp/window", () => ({ touchWindow: mocks.touchWindow }));
vi.mock("@/lib/channel-auth", () => ({ resolveChannelAuth: mocks.resolveChannelAuth }));
vi.mock("@/lib/redis", () => ({ getRedis: () => (mocks.hasRedis ? mocks.redis : null) }));

const { COPY } = await import("@/lib/whatsapp/copy");
const { claimTap, handleHarpyAction, handleIncomingAction, setPendingEdit, takePendingEdit } = await import(
  "@/lib/whatsapp/review"
);

function draft(id: string, status: DraftRecord["status"], revision: number): DraftRecord {
  return {
    id,
    ideaId: "i1",
    brandId: "b1",
    platform: "linkedin",
    status,
    revision,
    hook: "hook",
    text: `text of ${id}`,
    posts: [],
    mediaIds: [],
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

const base = { tapId: "wamid.tap1", waId: "4915", brandId: "b1" } as const;

function sentTexts(): string[] {
  return mocks.sendWhatsApp.mock.calls.map(([message]) => message.text?.body);
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.hasRedis = true;
  mocks.redis.set.mockResolvedValue("OK");
  mocks.sendWhatsApp.mockResolvedValue({ ok: true, wamid: "wamid.out" });
  mocks.sendReviewCards.mockResolvedValue({ sent: 1, windowClosed: false, error: null, lastWamid: null });
});

describe("claimTap", () => {
  it("sets the key with nx and a day of ttl", async () => {
    expect(await claimTap("t1")).toBe(true);
    expect(mocks.redis.set).toHaveBeenCalledWith("wa:tap:t1", "1", { nx: true, ex: 86_400 });
  });

  it("returns false for a repeat tap", async () => {
    mocks.redis.set.mockResolvedValue(null);
    expect(await claimTap("t1")).toBe(false);
  });

  it("processes taps when redis is missing", async () => {
    mocks.hasRedis = false;
    expect(await claimTap("t1")).toBe(true);
  });
});

describe("pending edit marker", () => {
  it("stores the marker with a 30 minute ttl", async () => {
    const edit = { draftId: "d1", revision: 2, platform: "linkedin" } as const;
    await setPendingEdit("4915", edit);
    expect(mocks.redis.set).toHaveBeenCalledWith("wa:edit:4915", JSON.stringify(edit), { ex: 1_800 });
  });

  it("returns the stored edit once, then null", async () => {
    const edit = { draftId: "d1", revision: 2, platform: "linkedin" };
    mocks.redis.getdel.mockResolvedValueOnce(JSON.stringify(edit)).mockResolvedValueOnce(null);
    expect(await takePendingEdit("4915")).toEqual(edit);
    expect(await takePendingEdit("4915")).toBeNull();
  });

  it("accepts an already parsed value", async () => {
    const edit = { draftId: "d1", revision: 2, platform: "linkedin" };
    mocks.redis.getdel.mockResolvedValueOnce(edit);
    expect(await takePendingEdit("4915")).toEqual(edit);
  });

  it("gives null for malformed json", async () => {
    mocks.redis.getdel.mockResolvedValueOnce("{nope");
    expect(await takePendingEdit("4915")).toBeNull();
  });

  it("gives null without redis", async () => {
    mocks.hasRedis = false;
    expect(await takePendingEdit("4915")).toBeNull();
  });
});

describe("handleHarpyAction", () => {
  it("does nothing for a repeated tap", async () => {
    mocks.redis.set.mockResolvedValue(null);
    await handleHarpyAction({ ...base, action: { verb: "approve", draftId: "d1", revision: 2 } });
    expect(mocks.approveDraft).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
    expect(mocks.touchWindow).not.toHaveBeenCalled();
  });

  it("approves and confirms", async () => {
    mocks.approveDraft.mockResolvedValue({ ok: true, draft: draft("d1", "approved", 2) });
    await handleHarpyAction({ ...base, action: { verb: "approve", draftId: "d1", revision: 2 } });
    expect(mocks.touchWindow).toHaveBeenCalledWith("4915");
    expect(mocks.approveDraft).toHaveBeenCalledWith({
      brandId: "b1",
      draftId: "d1",
      expectedRevision: 2,
      via: "whatsapp",
      expectedStatus: "pending_review",
    });
    expect(sentTexts()).toEqual([COPY.approved("LinkedIn")]);
  });

  it("sends the stale message and the latest card when approve is stale", async () => {
    const current = draft("d1", "pending_review", 3);
    mocks.approveDraft.mockResolvedValue({ ok: false, reason: "stale", draft: current });
    await handleHarpyAction({ ...base, action: { verb: "approve", draftId: "d1", revision: 2 } });
    expect(sentTexts()).toEqual(["That draft changed. Showing the latest."]);
    expect(mocks.sendReviewCards).toHaveBeenCalledWith({
      brandId: "b1",
      waId: "4915",
      drafts: [current],
      notificationId: null,
    });
  });

  it("sends no card when skip hits an invalid state", async () => {
    mocks.skipDraft.mockResolvedValue({ ok: false, reason: "invalid_state", draft: draft("d1", "skipped", 2) });
    await handleHarpyAction({ ...base, action: { verb: "skip", draftId: "d1", revision: 2 } });
    expect(mocks.skipDraft).toHaveBeenCalledWith({
      brandId: "b1",
      draftId: "d1",
      expectedRevision: 2,
      expectedStatus: "pending_review",
    });
    expect(sentTexts()).toEqual(["That draft can't do that right now."]);
    expect(mocks.sendReviewCards).not.toHaveBeenCalled();
  });

  it("confirms a skip", async () => {
    mocks.skipDraft.mockResolvedValue({ ok: true, draft: draft("d1", "skipped", 2) });
    await handleHarpyAction({ ...base, action: { verb: "skip", draftId: "d1", revision: 2 } });
    expect(sentTexts()).toEqual([COPY.skipped("LinkedIn")]);
  });

  it("says the draft is gone when it is missing", async () => {
    mocks.skipDraft.mockResolvedValue({ ok: false, reason: "not_found", draft: null });
    await handleHarpyAction({ ...base, action: { verb: "skip", draftId: "d1", revision: 2 } });
    expect(sentTexts()).toEqual(["That draft is gone."]);
    expect(mocks.sendReviewCards).not.toHaveBeenCalled();
  });

  it("sets the marker and prompts on a current edit tap", async () => {
    mocks.getDraft.mockResolvedValue(draft("d1", "pending_review", 2));
    await handleHarpyAction({ ...base, action: { verb: "edit", draftId: "d1", revision: 2 } });
    expect(mocks.redis.set).toHaveBeenCalledWith(
      "wa:edit:4915",
      JSON.stringify({ draftId: "d1", revision: 2, platform: "linkedin" }),
      { ex: 1_800 },
    );
    expect(sentTexts()).toEqual([COPY.editPrompt("LinkedIn")]);
  });

  it("sets no marker on an old revision and shows the latest card", async () => {
    const current = draft("d1", "pending_review", 3);
    mocks.getDraft.mockResolvedValue(current);
    await handleHarpyAction({ ...base, action: { verb: "edit", draftId: "d1", revision: 2 } });
    expect(mocks.redis.set).not.toHaveBeenCalledWith("wa:edit:4915", expect.anything(), expect.anything());
    expect(sentTexts()).toEqual(["That draft changed. Showing the latest."]);
    expect(mocks.sendReviewCards).toHaveBeenCalledWith(expect.objectContaining({ drafts: [current] }));
  });

  it("refuses to edit a draft that cannot be edited", async () => {
    mocks.getDraft.mockResolvedValue(draft("d1", "skipped", 2));
    await handleHarpyAction({ ...base, action: { verb: "edit", draftId: "d1", revision: 2 } });
    expect(sentTexts()).toEqual(["That draft can't do that right now."]);
  });

  it("says the draft is gone when an edit target is missing", async () => {
    mocks.getDraft.mockResolvedValue(null);
    await handleHarpyAction({ ...base, action: { verb: "edit", draftId: "d1", revision: 2 } });
    expect(sentTexts()).toEqual(["That draft is gone."]);
  });

  it("sends cards for every pending draft on review", async () => {
    const drafts = [draft("d1", "pending_review", 1), draft("d2", "pending_review", 1)];
    mocks.listDraftsForIdea.mockResolvedValue([...drafts, draft("d3", "approved", 1)]);
    await handleHarpyAction({ ...base, action: { verb: "review", ideaId: "i1" } });
    expect(mocks.listDraftsForIdea).toHaveBeenCalledWith("b1", "i1");
    expect(mocks.sendReviewCards).toHaveBeenCalledWith({
      brandId: "b1",
      waId: "4915",
      drafts,
      notificationId: null,
    });
  });

  it("says nothing is waiting when no draft is pending", async () => {
    mocks.listDraftsForIdea.mockResolvedValue([draft("d3", "approved", 1)]);
    await handleHarpyAction({ ...base, action: { verb: "review", ideaId: "i1" } });
    expect(sentTexts()).toEqual([COPY.nothingToReview]);
    expect(mocks.sendReviewCards).not.toHaveBeenCalled();
  });
});

describe("handleIncomingAction", () => {
  it("ignores ids that are not harpy actions", async () => {
    await handleIncomingAction({ actionId: "other:thing", tapId: "t", waId: "4915", phone: null });
    expect(mocks.resolveChannelAuth).not.toHaveBeenCalled();
    expect(mocks.redis.set).not.toHaveBeenCalled();
  });

  it("ignores strangers", async () => {
    mocks.resolveChannelAuth.mockResolvedValue(null);
    await handleIncomingAction({ actionId: "harpy:review:i1", tapId: "t", waId: "4915", phone: "+4915" });
    expect(mocks.resolveChannelAuth).toHaveBeenCalledWith({
      channel: "whatsapp",
      externalId: "4915",
      phone: "+4915",
      extraAttributes: { waId: "4915" },
    });
    expect(mocks.redis.set).not.toHaveBeenCalled();
    expect(mocks.sendWhatsApp).not.toHaveBeenCalled();
  });

  it("handles a linked sender's tap with the principal's brand", async () => {
    mocks.resolveChannelAuth.mockResolvedValue({ attributes: { brandId: "b9" } });
    mocks.listDraftsForIdea.mockResolvedValue([]);
    await handleIncomingAction({ actionId: "harpy:review:i1", tapId: "t", waId: "4915", phone: null });
    expect(mocks.listDraftsForIdea).toHaveBeenCalledWith("b9", "i1");
  });
});
