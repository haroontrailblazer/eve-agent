import type { WorkflowStepToolContext } from "eve/tools";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IdeaRecord } from "@/lib/drafts/records";

const mocks = vi.hoisted(() => {
  class RateLimitError extends Error {
    readonly retryAfter = 60;
  }

  class IdeaNotFoundError extends Error {}

  return {
    IdeaNotFoundError,
    RateLimitError,
    saveContentPiece: vi.fn(),
    setDraftMedia: vi.fn(),
    setPieceMedia: vi.fn(),
    createIdea: vi.fn(),
    enforceRateLimit: vi.fn(),
    getActiveVoiceGuide: vi.fn(),
    getBrandSettings: vi.fn(),
    getIdea: vi.fn(),
    listDraftsForIdea: vi.fn(),
    listPiecesForIdea: vi.fn(),
    listVoiceExamples: vi.fn(),
    listVoicePreferences: vi.fn(),
    resolveBrandContext: vi.fn(),
  };
});

vi.mock("@/lib/mcp-context", () => ({ resolveBrandContext: mocks.resolveBrandContext }));
vi.mock("@/lib/rate-limit", () => ({ RateLimitError: mocks.RateLimitError, enforceRateLimit: mocks.enforceRateLimit }));
vi.mock("@/lib/db/brands", () => ({ getBrandSettings: mocks.getBrandSettings }));
vi.mock("@/lib/voice/store", () => ({
  getActiveVoiceGuide: mocks.getActiveVoiceGuide,
  listVoiceExamples: mocks.listVoiceExamples,
  listVoicePreferences: mocks.listVoicePreferences,
}));
vi.mock("@/lib/drafts/store", () => ({
  createIdea: mocks.createIdea,
  getIdea: mocks.getIdea,
  IdeaNotFoundError: mocks.IdeaNotFoundError,
  listDraftsForIdea: mocks.listDraftsForIdea,
  listPiecesForIdea: mocks.listPiecesForIdea,
  saveContentPiece: mocks.saveContentPiece,
  saveGeneratedDraft: vi.fn(),
  setDraftMedia: mocks.setDraftMedia,
  setPieceMedia: mocks.setPieceMedia,
}));
vi.mock("@/lib/media/generate", () => ({ generateBrandImage: vi.fn() }));

const { attachDraftImageStep, attachPieceImageStep, prepareDrafting, savePieceStep } = await import("@/lib/drafts/steps");

function ctxWith(attributes: Record<string, unknown>): WorkflowStepToolContext {
  return { session: { auth: { current: { attributes } } } } as unknown as WorkflowStepToolContext;
}

const ctx = ctxWith({ brandId: "brand-1", channel: "whatsapp" });

const idea = (overrides: Partial<IdeaRecord> = {}): IdeaRecord => ({
  id: "idea-1",
  brandId: "brand-1",
  text: "Small teams ship faster",
  sourceKind: "text",
  sourceChannel: "studio",
  sourceRef: null,
  requested: { platforms: ["x", "threads"], pieces: [] },
  draftRequestedAt: null,
  createdAt: "2026-10-24T10:00:00.000Z",
  ...overrides,
});

const example = (id: string, platform: "x" | "linkedin" | null, text: string, createdAt: string) => ({
  id,
  brandId: "brand-1",
  platform,
  text,
  source: "pasted" as const,
  createdAt,
});

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    if (typeof mock === "function" && "mockReset" in mock) mock.mockReset();
  }
  mocks.resolveBrandContext.mockResolvedValue({ brandId: "brand-1", userId: "user-1" });
  mocks.enforceRateLimit.mockResolvedValue(undefined);
  mocks.getBrandSettings.mockResolvedValue({ timezone: "Asia/Kolkata", name: "Brand" });
  mocks.getActiveVoiceGuide.mockResolvedValue({ body: "Write plainly." });
  mocks.listVoicePreferences.mockResolvedValue([{ text: "No hashtags" }]);
  mocks.listVoiceExamples.mockResolvedValue([]);
  mocks.listDraftsForIdea.mockResolvedValue([]);
  mocks.listPiecesForIdea.mockResolvedValue([]);
  mocks.createIdea.mockImplementation(async (input: { text: string; requested: IdeaRecord["requested"] }) =>
    idea({ id: "idea-new", text: input.text, requested: input.requested }),
  );
  mocks.getIdea.mockResolvedValue(idea());
});

describe("prepareDrafting", () => {
  it("needs a signed-in brand", async () => {
    mocks.resolveBrandContext.mockResolvedValue(null);
    expect(await prepareDrafting(ctx, { idea: "x" })).toEqual({ ok: false, message: "You need to be signed in to draft posts." });
  });

  it.each([
    ["neither", {}],
    ["both", { ideaId: "idea-1", idea: "Text" }],
    ["a blank idea", { idea: "   " }],
  ])("needs exactly one of ideaId or idea (%s)", async (_label, input) => {
    expect(await prepareDrafting(ctx, input)).toEqual({ ok: false, message: "Give me an idea to draft." });
    expect(mocks.createIdea).not.toHaveBeenCalled();
  });

  it("applies the hourly drafting limit", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new mocks.RateLimitError("Too many requests."));
    expect(await prepareDrafting(ctx, { idea: "Text" })).toEqual({
      ok: false,
      message: "Drafting limit reached (20 an hour). Try again later.",
    });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith({ key: "brand-1", limit: 20, prefix: "draft:run", windowSeconds: 3_600 });
    expect(mocks.createIdea).not.toHaveBeenCalled();
  });

  it("reports an idea that is gone", async () => {
    mocks.getIdea.mockResolvedValue(null);
    expect(await prepareDrafting(ctx, { ideaId: "idea-9" })).toEqual({ ok: false, message: "That idea is gone." });
    expect(mocks.getIdea).toHaveBeenCalledWith("brand-1", "idea-9");
  });

  it("creates the idea from the input and its sources", async () => {
    const result = await prepareDrafting(ctx, {
      idea: "Small teams ship faster",
      sources: [{ text: "Notes" }, { url: "https://a.co/post", title: "A", text: "Body" }],
      pieces: ["reel_script"],
      platforms: ["linkedin"],
    });
    expect(mocks.createIdea).toHaveBeenCalledWith({
      brandId: "brand-1",
      userId: "user-1",
      text: "Small teams ship faster",
      sourceKind: "link",
      sourceChannel: "whatsapp",
      sourceRef: "https://a.co/post",
      requested: { platforms: ["linkedin"], pieces: ["reel_script"] },
    });
    expect(result).toMatchObject({
      ok: true,
      brandId: "brand-1",
      userId: "user-1",
      plan: {
        ideaId: "idea-new",
        idea: "Small teams ship faster",
        timezone: "Asia/Kolkata",
        voiceGuide: "Write plainly.",
        preferences: ["No hashtags"],
        allowLinksOnX: false,
        redraft: false,
        sources: [
          { url: null, title: null, text: "Notes" },
          { url: "https://a.co/post", title: "A", text: "Body" },
        ],
        targets: [
          { target: { kind: "post", platform: "linkedin" }, existing: null },
          { target: { kind: "piece", piece: "reel_script" }, existing: null },
        ],
      },
    });
    expect(result.ok && Number.isNaN(Date.parse(result.plan.now))).toBe(false);
    expect(mocks.listVoicePreferences).toHaveBeenCalledWith("brand-1", 30);
    expect(mocks.listVoiceExamples).toHaveBeenCalledWith("brand-1", 100);
  });

  it("writes no idea when a read fails, so a step retry can't make two", async () => {
    mocks.listVoiceExamples.mockRejectedValue(new Error("connection reset"));
    await expect(prepareDrafting(ctx, { idea: "Text" })).rejects.toThrow("connection reset");
    expect(mocks.createIdea).not.toHaveBeenCalled();
  });

  it("does not look for drafts of a brand-new idea", async () => {
    await prepareDrafting(ctx, { idea: "Text" });
    expect(mocks.listDraftsForIdea).not.toHaveBeenCalled();
    expect(mocks.listPiecesForIdea).not.toHaveBeenCalled();
  });

  it("marks a text idea from an unknown channel as web", async () => {
    await prepareDrafting(ctxWith({ brandId: "brand-1" }), { idea: "Text" });
    expect(mocks.createIdea).toHaveBeenCalledWith(
      expect.objectContaining({ sourceKind: "text", sourceChannel: "web", sourceRef: null, requested: { platforms: ["x", "linkedin", "threads"], pieces: [] } }),
    );
  });

  it("drafts a saved idea with its requested targets and finds what already exists", async () => {
    mocks.listDraftsForIdea.mockResolvedValue([{ id: "draft-x", platform: "x", revision: 3 }]);
    const result = await prepareDrafting(ctx, { ideaId: "idea-1", redraft: true, allowLinksOnX: true });
    expect(mocks.createIdea).not.toHaveBeenCalled();
    expect(mocks.listDraftsForIdea).toHaveBeenCalledWith("brand-1", "idea-1");
    expect(mocks.listPiecesForIdea).toHaveBeenCalledWith("brand-1", "idea-1");
    expect(result).toMatchObject({
      ok: true,
      plan: {
        ideaId: "idea-1",
        idea: "Small teams ship faster",
        redraft: true,
        allowLinksOnX: true,
        targets: [
          { target: { kind: "post", platform: "x" }, existing: { draftId: "draft-x", revision: 3 } },
          { target: { kind: "post", platform: "threads" }, existing: null },
        ],
      },
    });
  });

  it("finds an existing piece", async () => {
    mocks.getIdea.mockResolvedValue(idea({ requested: { platforms: [], pieces: ["carousel_outline"] } }));
    mocks.listPiecesForIdea.mockResolvedValue([{ id: "piece-1", kind: "carousel_outline" }]);
    const result = await prepareDrafting(ctx, { ideaId: "idea-1" });
    expect(result).toMatchObject({ ok: true, plan: { targets: [{ target: { kind: "piece", piece: "carousel_outline" }, existing: { pieceId: "piece-1" } }] } });
  });

  it.each([
    ["an invalid zone", { timezone: "Mars/Olympus", name: "Brand" }],
    ["no brand settings", null],
  ])("falls back to UTC for %s", async (_label, settings) => {
    mocks.getBrandSettings.mockResolvedValue(settings);
    const result = await prepareDrafting(ctx, { idea: "Text" });
    expect(result).toMatchObject({ ok: true, plan: { timezone: "UTC" } });
  });

  it("picks 4 exemplars per target, by platform for posts and topic for pieces", async () => {
    mocks.listVoiceExamples.mockResolvedValue([
      example("e1", "x", "Teams ship weekly", "2026-10-01T00:00:00Z"),
      example("e2", "linkedin", "Small teams ship faster than big ones", "2026-10-02T00:00:00Z"),
      example("e3", "x", "Coffee thoughts", "2026-10-03T00:00:00Z"),
      example("e4", null, "Ship faster", "2026-10-04T00:00:00Z"),
      example("e5", "x", "Lunch", "2026-10-05T00:00:00Z"),
      example("e6", "x", "Dinner", "2026-10-06T00:00:00Z"),
    ]);
    const result = await prepareDrafting(ctx, { idea: "Small teams ship faster", platforms: ["x"], pieces: ["reel_script"] });
    if (!result.ok) throw new Error(result.message);
    const [x, piece] = result.plan.targets;
    expect(x!.exemplars).toHaveLength(4);
    expect(x!.exemplars[0]).toEqual({ platform: "linkedin", text: "Small teams ship faster than big ones" });
    expect(piece!.exemplars.map((e) => e.text)).toEqual([
      "Small teams ship faster than big ones",
      "Ship faster",
      "Teams ship weekly",
      "Dinner",
    ]);
  });
});

describe("expected misses come back as results, so the workflow doesn't retry them", () => {
  const pieceInput = {
    brandId: "brand-1",
    ideaId: "idea-1",
    kind: "reel_script" as const,
    title: "Reel",
    body: { hook: "h", beats: [], caption: "c", notes: "" },
    mode: "create" as const,
  };

  it("returns a saved piece", async () => {
    const piece = { id: "piece-1" };
    mocks.saveContentPiece.mockResolvedValue({ piece, created: true });
    expect(await savePieceStep(pieceInput)).toEqual({ ok: true, piece, created: true });
  });

  it("returns idea_gone for a piece whose idea is gone", async () => {
    mocks.saveContentPiece.mockRejectedValue(new mocks.IdeaNotFoundError("That idea is gone."));
    expect(await savePieceStep(pieceInput)).toEqual({ ok: false, reason: "idea_gone" });
  });

  it("still throws an infrastructure error so it is retried", async () => {
    mocks.saveContentPiece.mockRejectedValue(new Error("connection reset"));
    await expect(savePieceStep(pieceInput)).rejects.toThrow("connection reset");
  });

  it("returns whether the draft image landed on the revision", async () => {
    mocks.setDraftMedia.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const input = { brandId: "brand-1", draftId: "draft-1", revision: 2, mediaId: "media-1" };
    expect(await attachDraftImageStep(input)).toBe(true);
    expect(await attachDraftImageStep(input)).toBe(false);
    expect(mocks.setDraftMedia).toHaveBeenCalledWith({ brandId: "brand-1", draftId: "draft-1", revision: 2, mediaIds: ["media-1"] });
  });

  it("returns whether the piece image landed", async () => {
    mocks.setPieceMedia.mockResolvedValue(false);
    expect(await attachPieceImageStep({ brandId: "brand-1", pieceId: "piece-1", mediaId: "media-1" })).toBe(false);
  });

  it("still throws when the database fails during an attach", async () => {
    mocks.setDraftMedia.mockRejectedValue(new Error("connection reset"));
    await expect(attachDraftImageStep({ brandId: "brand-1", draftId: "d", revision: 1, mediaId: "m" })).rejects.toThrow("connection reset");
  });
});
