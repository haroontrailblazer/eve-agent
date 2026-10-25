import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/whatsapp/deliver", () => ({ notifyDraftsReady: vi.fn() }));
vi.mock("@/lib/drafts/store", () => ({ getDraft: vi.fn() }));

const { submitForReview } = await import("@/lib/whatsapp/submit");

type Notify = NonNullable<NonNullable<Parameters<typeof submitForReview>[1]>["notifyDraftsReady"]>;
type Get = NonNullable<NonNullable<Parameters<typeof submitForReview>[1]>["getDraft"]>;

const base = { brandId: "b1", channel: "whatsapp", waId: "4915" };

function notifier(...results: Awaited<ReturnType<Notify>>[]) {
  const fn = vi.fn();
  for (const result of results) fn.mockResolvedValueOnce(result);
  return fn;
}

describe("submitForReview", () => {
  it("only confirms off WhatsApp", async () => {
    const notify = notifier();
    const result = await submitForReview({ ...base, channel: "web", ideaId: "i1" }, { notifyDraftsReady: notify as unknown as Notify });
    expect(result).toEqual({ ok: true, delivery: "studio", sent: 0, message: "The drafts are in Studio." });
    expect(notify).not.toHaveBeenCalled();
  });

  it("fails without a waId", async () => {
    const result = await submitForReview({ ...base, waId: null, ideaId: "i1" });
    expect(result).toEqual({ ok: false, message: "This WhatsApp session has no number to send to." });
  });

  it("sends one idea's cards", async () => {
    const notify = notifier({ ok: true, delivery: "cards", sent: 1 });
    const result = await submitForReview({ ...base, ideaId: "i1" }, { notifyDraftsReady: notify as unknown as Notify });
    expect(notify).toHaveBeenCalledWith({ brandId: "b1", waId: "4915", ideaId: "i1", draftIds: undefined, resendKey: undefined });
    expect(result).toEqual({ ok: true, delivery: "cards", sent: 1, message: "Sent 1 review card." });
  });

  it("groups draftIds by idea and ignores missing drafts", async () => {
    const notify = notifier({ ok: true, delivery: "cards", sent: 2 }, { ok: true, delivery: "cards", sent: 1 });
    const get = vi.fn(async (_brand: string, id: string) =>
      id === "d1" || id === "d2" ? { ideaId: "i1" } : id === "d3" ? { ideaId: "i2" } : null,
    );
    const result = await submitForReview(
      { ...base, draftIds: ["d1", "d2", "d3", "gone"], resendKey: "k" },
      { notifyDraftsReady: notify as unknown as Notify, getDraft: get as unknown as Get },
    );
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith({ brandId: "b1", waId: "4915", ideaId: "i1", draftIds: ["d1", "d2"], resendKey: "k" });
    expect(notify).toHaveBeenCalledWith({ brandId: "b1", waId: "4915", ideaId: "i2", draftIds: ["d3"], resendKey: "k" });
    expect(result).toEqual({ ok: true, delivery: "cards", sent: 3, message: "Sent 3 review cards." });
  });

  it("reports a template when any call used one", async () => {
    const notify = notifier({ ok: true, delivery: "cards", sent: 1 }, { ok: true, delivery: "template", sent: 1 });
    const get = vi.fn(async (_b: string, id: string) => ({ ideaId: id }));
    const result = await submitForReview(
      { ...base, draftIds: ["i1", "i2"] },
      { notifyDraftsReady: notify as unknown as Notify, getDraft: get as unknown as Get },
    );
    expect(result).toMatchObject({ ok: true, delivery: "template", sent: 2 });
    expect(result.ok && result.message).toContain("only allows a template message");
  });

  it("reports a duplicate only when every call was one", async () => {
    const get = vi.fn(async (_b: string, id: string) => ({ ideaId: id }));
    const deps = (n: Notify) => ({ notifyDraftsReady: n, getDraft: get as unknown as Get });
    const all = await submitForReview(
      { ...base, draftIds: ["i1", "i2"] },
      deps(notifier({ ok: true, delivery: "duplicate", sent: 0 }, { ok: true, delivery: "duplicate", sent: 0 }) as unknown as Notify),
    );
    expect(all).toEqual({ ok: true, delivery: "duplicate", sent: 0, message: "Those cards were already sent." });
    const mixed = await submitForReview(
      { ...base, draftIds: ["i1", "i2"] },
      deps(notifier({ ok: true, delivery: "duplicate", sent: 0 }, { ok: true, delivery: "cards", sent: 1 }) as unknown as Notify),
    );
    expect(mixed).toMatchObject({ delivery: "cards", sent: 1 });
  });

  it("passes a notify failure through", async () => {
    const notify = notifier({ ok: false, reason: "nothing_to_review", message: "There are no drafts waiting for review." });
    const result = await submitForReview({ ...base, ideaId: "i1" }, { notifyDraftsReady: notify as unknown as Notify });
    expect(result).toEqual({ ok: false, message: "There are no drafts waiting for review." });
  });

  it("fails when no listed draft exists", async () => {
    const get = vi.fn(async () => null);
    const result = await submitForReview({ ...base, draftIds: ["x"] }, { getDraft: get as unknown as Get });
    expect(result.ok).toBe(false);
  });
});
