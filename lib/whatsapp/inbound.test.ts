import { describe, expect, it, vi } from "vitest";
import { COPY } from "@/lib/whatsapp/copy";
import {
  type InboundDeps,
  type InboundMessage,
  planInbound,
  runInbound,
  toInboundMessage,
  WHATSAPP_INBOUND_PER_10_MIN,
} from "@/lib/whatsapp/inbound";

const AUTH = { attributes: { brandId: "b1", channel: "whatsapp", waId: "w1" } } as never;
const VOICE_CONTEXT = "The owner sent this as a voice note. The text is its transcript.";

function message(overrides: Partial<InboundMessage> = {}): InboundMessage {
  return {
    id: "m1",
    waId: "w1",
    phone: "w1",
    bsuid: null,
    text: "hi",
    attachments: [],
    quotedWamid: null,
    ...overrides,
  };
}

// Every collaborator is a fake; the redis fake is reachable as `d.redis`.
function deps(overrides: Record<string, unknown> = {}) {
  const redis = { incr: vi.fn().mockResolvedValue(1), expire: vi.fn().mockResolvedValue(1) };
  const base = {
    resolveAuth: vi.fn().mockResolvedValue(AUTH),
    redeemLinkCode: vi.fn().mockResolvedValue({ ok: false, reason: "invalid" }),
    getRedis: vi.fn().mockReturnValue(redis),
    touchWindow: vi.fn().mockResolvedValue(undefined),
    takePendingEdit: vi.fn().mockResolvedValue(null),
    findWaMessage: vi.fn().mockResolvedValue(null),
    requestRevision: vi.fn().mockResolvedValue({ ok: true, draft: {} }),
    getDraft: vi.fn().mockResolvedValue(null),
    transcribe: vi.fn().mockResolvedValue("hello there"),
    send: vi.fn().mockResolvedValue({ ok: true, wamid: "x" }),
    sendReviewCards: vi.fn().mockResolvedValue({}),
    now: () => new Date("2026-10-25T10:00:00.000Z"),
  };
  const merged = { ...base, ...overrides };
  return { ...merged, redis, as: merged as unknown as Partial<InboundDeps> } as typeof base & {
    redis: typeof redis;
    as: Partial<InboundDeps>;
  };
}

const voice = { type: "audio" as const, fetchData: async () => Buffer.from("a") };

describe("planInbound", () => {
  it("ignores strangers without touching anything else", async () => {
    const d = deps({ resolveAuth: vi.fn().mockResolvedValue(null) });
    expect(await planInbound(message(), d.as)).toEqual({ kind: "ignore" });
    expect(d.transcribe).not.toHaveBeenCalled();
    expect(d.touchWindow).not.toHaveBeenCalled();
    expect(d.takePendingEdit).not.toHaveBeenCalled();
  });

  it("never transcribes for strangers", async () => {
    const d = deps({ resolveAuth: vi.fn().mockResolvedValue(null) });
    const plan = await planInbound(message({ text: "[Audio message]", attachments: [voice] }), d.as);
    expect(plan).toEqual({ kind: "ignore" });
    expect(d.transcribe).not.toHaveBeenCalled();
  });

  it("links a stranger with a valid code", async () => {
    const d = deps({
      resolveAuth: vi.fn().mockResolvedValue(null),
      redeemLinkCode: vi.fn().mockResolvedValue({ ok: true, email: "owner@example.com" }),
    });
    const plan = await planInbound(message({ text: "LINK 123456" }), d.as);
    expect(plan).toMatchObject({ kind: "reply", text: COPY.linked("owner@example.com") });
    expect(d.redeemLinkCode).toHaveBeenCalledWith(
      expect.objectContaining({ channel: "whatsapp", externalId: "w1", code: "123456" }),
    );
  });

  it("ignores a stranger with an invalid code", async () => {
    const d = deps({ resolveAuth: vi.fn().mockResolvedValue(null) });
    expect(await planInbound(message({ text: "LINK 123456" }), d.as)).toEqual({ kind: "ignore" });
  });

  it("tells a linked sender when a code fails, without reading the edit marker", async () => {
    const d = deps();
    expect(await planInbound(message({ text: "LINK 123456" }), d.as)).toMatchObject({
      kind: "reply",
      text: COPY.linkFailed,
    });
    expect(d.takePendingEdit).not.toHaveBeenCalled();
  });

  it("rate limits at 31 and goes silent after", async () => {
    const d = deps();
    d.redis.incr.mockResolvedValueOnce(WHATSAPP_INBOUND_PER_10_MIN + 1);
    expect(await planInbound(message(), d.as)).toMatchObject({ kind: "reply", text: COPY.rateLimited });
    d.redis.incr.mockResolvedValueOnce(WHATSAPP_INBOUND_PER_10_MIN + 2);
    expect(await planInbound(message(), d.as)).toEqual({ kind: "ignore" });
    expect(d.redis.incr).toHaveBeenCalledWith(`wa:inbound:w1:${Math.floor(d.now().getTime() / 600_000)}`);
  });

  it("sets the counter expiry on the first message only", async () => {
    const d = deps();
    await planInbound(message(), d.as);
    expect(d.redis.expire).toHaveBeenCalledWith(expect.stringContaining("wa:inbound:w1:"), 600);
    d.redis.expire.mockClear();
    d.redis.incr.mockResolvedValueOnce(2);
    await planInbound(message(), d.as);
    expect(d.redis.expire).not.toHaveBeenCalled();
  });

  it("does not limit without redis", async () => {
    const d = deps({ getRedis: vi.fn().mockReturnValue(null) });
    expect(await planInbound(message(), d.as)).toMatchObject({ kind: "turn" });
  });

  it("resets on /new without reading the edit marker", async () => {
    const d = deps();
    expect(await planInbound(message({ text: " /New " }), d.as)).toEqual({ kind: "reset", auth: AUTH });
    expect(d.touchWindow).toHaveBeenCalledWith("w1");
    expect(d.takePendingEdit).not.toHaveBeenCalled();
  });

  it("turns a voice note into its transcript", async () => {
    const d = deps();
    const plan = await planInbound(message({ text: "[Audio message]", attachments: [voice] }), d.as);
    expect(plan).toEqual({ kind: "turn", auth: AUTH, text: "hello there", attachments: [], context: [VOICE_CONTEXT] });
  });

  it("appends the transcript to a caption", async () => {
    const d = deps();
    const plan = await planInbound(message({ text: "see this", attachments: [voice] }), d.as);
    expect(plan).toMatchObject({ kind: "turn", text: "see this\nhello there" });
  });

  it("replies when transcription fails", async () => {
    const d = deps({ transcribe: vi.fn().mockRejectedValue(new Error("boom")) });
    const plan = await planInbound(message({ text: "[Audio message]", attachments: [voice] }), d.as);
    expect(plan).toMatchObject({ kind: "reply", text: COPY.voiceFailed });
  });

  it("drops locations and ignores a sticker alone", async () => {
    const d = deps();
    const location = { type: "file" as const, mimeType: "application/geo+json" };
    const image = { type: "image" as const, mimeType: "image/png" };
    const plan = await planInbound(message({ text: "look", attachments: [location, image] }), d.as);
    expect(plan).toMatchObject({ kind: "turn", attachments: [image] });

    const sticker = { type: "image" as const, name: "sticker" };
    expect(await planInbound(message({ text: "[Sticker]", attachments: [sticker] }), d.as)).toEqual({
      kind: "ignore",
    });
  });

  it("adds an edit context from the pending marker", async () => {
    const d = deps({ takePendingEdit: vi.fn().mockResolvedValue({ draftId: "d1", revision: 2, platform: "x" }) });
    const plan = await planInbound(message({ text: "shorter" }), d.as);
    expect(d.requestRevision).toHaveBeenCalledWith({ brandId: "b1", draftId: "d1", expectedRevision: 2 });
    expect(plan.kind).toBe("turn");
    const context = (plan as { context: readonly string[] }).context.join("\n");
    expect(context).toContain('revise_draft with draftId "d1"');
    expect(context).toContain('submit_for_review with draftIds ["d1"]');
    expect(context).toContain("the X draft d1");
  });

  it("replies with the latest card when the edit is stale", async () => {
    const d = deps({
      takePendingEdit: vi.fn().mockResolvedValue({ draftId: "d1", revision: 2, platform: "x" }),
      requestRevision: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "stale", draft: { id: "d1", status: "pending_review" } }),
    });
    const plan = await planInbound(message({ text: "shorter" }), d.as);
    expect(plan).toEqual({
      kind: "reply",
      text: "That draft changed. Showing the latest.",
      brandId: "b1",
      cardDraftId: "d1",
    });
  });

  it("sends no card when the current draft is no longer pending", async () => {
    const d = deps({
      takePendingEdit: vi.fn().mockResolvedValue({ draftId: "d1", revision: 2, platform: "x" }),
      requestRevision: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "stale", draft: { id: "d1", status: "approved" } }),
    });
    const plan = await planInbound(message({ text: "shorter" }), d.as);
    expect(plan).not.toHaveProperty("cardDraftId");
  });

  it("uses a quoted card as the edit target", async () => {
    const d = deps({
      findWaMessage: vi
        .fn()
        .mockResolvedValue({ brandId: "b1", draftId: "d2", revision: 1, kind: "card", notificationId: null }),
      getDraft: vi.fn().mockResolvedValue({ id: "d2", platform: "linkedin" }),
    });
    const plan = await planInbound(message({ text: "punchier", quotedWamid: "wamid.q" }), d.as);
    expect(d.requestRevision).toHaveBeenCalledWith({ brandId: "b1", draftId: "d2", expectedRevision: 1 });
    expect((plan as { context: readonly string[] }).context.join("\n")).toContain('revise_draft with draftId "d2"');
  });

  it("ignores a quoted message from another brand", async () => {
    const d = deps({
      findWaMessage: vi
        .fn()
        .mockResolvedValue({ brandId: "other", draftId: "d2", revision: 1, kind: "card", notificationId: null }),
    });
    const plan = await planInbound(message({ text: "punchier", quotedWamid: "wamid.q" }), d.as);
    expect(d.requestRevision).not.toHaveBeenCalled();
    expect(plan).toMatchObject({ kind: "turn", context: [] });
  });
});

describe("runInbound", () => {
  const effects = () => ({ startTurn: vi.fn().mockResolvedValue(undefined), resetSession: vi.fn() });

  it("sends nothing when no reset ran", async () => {
    const d = deps();
    const e = effects();
    e.resetSession.mockResolvedValue(false);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runInbound(message({ text: "/new" }), e, d.as);
    expect(d.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("confirms a reset", async () => {
    const d = deps();
    const e = effects();
    e.resetSession.mockResolvedValue(true);
    await runInbound(message({ text: "/new" }), e, d.as);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(d.send.mock.calls[0])).toContain(COPY.reset);
  });

  it("starts a turn", async () => {
    const d = deps();
    const e = effects();
    await runInbound(message(), e, d.as);
    expect(e.startTurn).toHaveBeenCalledWith(expect.objectContaining({ kind: "turn", text: "hi" }));
  });

  it("sends the reply and then the card", async () => {
    const draft = { id: "d1" };
    const d = deps({
      takePendingEdit: vi.fn().mockResolvedValue({ draftId: "d1", revision: 2, platform: "x" }),
      requestRevision: vi
        .fn()
        .mockResolvedValue({ ok: false, reason: "stale", draft: { id: "d1", status: "pending_review" } }),
      getDraft: vi.fn().mockResolvedValue(draft),
    });
    await runInbound(message({ text: "shorter" }), effects(), d.as);
    expect(d.send).toHaveBeenCalledTimes(1);
    expect(d.sendReviewCards).toHaveBeenCalledWith({ brandId: "b1", waId: "w1", drafts: [draft], notificationId: null });
  });

  it("does nothing for ignored messages", async () => {
    const d = deps({ resolveAuth: vi.fn().mockResolvedValue(null) });
    const e = effects();
    await runInbound(message(), e, d.as);
    expect(d.send).not.toHaveBeenCalled();
    expect(e.startTurn).not.toHaveBeenCalled();
  });
});

describe("toInboundMessage", () => {
  it("reads phone, bsuid and the quoted wamid from the raw payload", () => {
    const result = toInboundMessage({
      id: "m",
      text: "t",
      author: { userId: "US.123abc" },
      raw: { contact: { wa_id: "15551234567" }, userId: "US.123abc", message: { context: { id: "wamid.q" } } },
    });
    expect(result).toMatchObject({
      waId: "US.123abc",
      phone: "15551234567",
      bsuid: "US.123abc",
      quotedWamid: "wamid.q",
    });
  });

  it("falls back to a numeric author as the phone", () => {
    const result = toInboundMessage({ id: "m", text: "t", author: { userId: "15551234567" } });
    expect(result).toMatchObject({ phone: "15551234567", bsuid: null, quotedWamid: null, attachments: [] });
  });
});
