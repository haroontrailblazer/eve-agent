import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const rows = vi.fn();
  const wheres: unknown[] = [];
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "limit", "orderBy", "set", "returning"]) chain[name] = () => chain;
  chain.where = (condition: unknown) => {
    wheres.push(condition);
    return chain;
  };
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(rows()).then(resolve, reject);
  const onConflictDoNothing = vi.fn((_: unknown) => chain);
  const onConflictDoUpdate = vi.fn((_: unknown) => chain);
  chain.onConflictDoNothing = onConflictDoNothing;
  chain.onConflictDoUpdate = onConflictDoUpdate;
  const values = vi.fn((_: unknown) => chain);
  return {
    execute: vi.fn(),
    insert: vi.fn(() => ({ values })),
    onConflictDoNothing,
    onConflictDoUpdate,
    rows,
    select: vi.fn(() => chain),
    update: vi.fn(() => chain),
    values,
    wheres,
  };
});

vi.mock("@/lib/db/client", () => ({
  db: { execute: mocks.execute, insert: mocks.insert, select: mocks.select, update: mocks.update },
}));

const store = await import("@/lib/drafts/store");

const NOW = "2026-10-24T10:00:00.000Z";

function render(query: unknown) {
  return new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
}

function params(query: unknown) {
  return new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).params;
}

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    idea_id: "i1",
    brand_id: "b1",
    platform: "x",
    status: "pending_review",
    revision: 1,
    hook: "h",
    text: "a\n\nb",
    thread_parts: ["a", "b"],
    media_ids: [],
    image_prompt: null,
    scheduled_at: null,
    approved_at: null,
    approved_via: null,
    notes: "",
    revision_requested_at: null,
    external_url: null,
    created_at: NOW,
    updated_at: NOW,
    ...overrides,
  };
}

function dbDraft(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    ideaId: "i1",
    brandId: "b1",
    platform: "x",
    status: "pending_review",
    revision: 1,
    hook: "h",
    text: "t",
    threadParts: null,
    mediaIds: [],
    imagePrompt: null,
    scheduledAt: null,
    approvedAt: null,
    approvedVia: null,
    publishedAt: null,
    externalPostId: null,
    externalUrl: null,
    error: null,
    notes: "",
    revisionRequestedAt: null,
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
    ...overrides,
  };
}

const baseInput = {
  brandId: "b1",
  ideaId: "i1",
  platform: "x" as const,
  hook: "h",
  posts: ["a", "b"],
  imagePrompt: null,
  scheduledAt: null,
  notes: "",
};

beforeEach(() => {
  for (const mock of [
    mocks.execute,
    mocks.rows,
    mocks.insert,
    mocks.onConflictDoNothing,
    mocks.onConflictDoUpdate,
    mocks.select,
    mocks.update,
    mocks.values,
  ]) {
    mock.mockReset();
  }
  mocks.insert.mockImplementation(() => ({ values: mocks.values }));
  mocks.values.mockImplementation(() => ({
    onConflictDoNothing: mocks.onConflictDoNothing,
    onConflictDoUpdate: mocks.onConflictDoUpdate,
    returning: () => mocks.rows(),
  }));
  mocks.onConflictDoNothing.mockImplementation(() => ({ returning: () => mocks.rows() }));
  mocks.onConflictDoUpdate.mockImplementation(() => ({ returning: () => mocks.rows() }));
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "limit", "orderBy", "set", "returning"]) chain[name] = () => chain;
  chain.where = (condition: unknown) => {
    mocks.wheres.push(condition);
    return chain;
  };
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(mocks.rows()).then(resolve, reject);
  mocks.select.mockImplementation(() => chain);
  mocks.update.mockImplementation(() => chain);
  mocks.wheres.length = 0;
});

describe("saveGeneratedDraft", () => {
  it("create mode inserts the draft and its first revision in one statement", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow()] });
    const result = await store.saveGeneratedDraft({ ...baseInput, mode: "create" });
    expect(result).toMatchObject({ ok: true, created: true, draft: { posts: ["a", "b"], text: "a\n\nb" } });
    const query = mocks.execute.mock.calls[0][0];
    const text = render(query);
    expect(text).toContain('on conflict ("idea_id", "platform") do nothing');
    expect(text).toContain('insert into "draft_revision"');
    expect(text).toContain('on conflict ("draft_id", "revision") do nothing');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
    expect(params(query)).toEqual(expect.arrayContaining([JSON.stringify(["a", "b"]), "a\n\nb"]));
  });

  it("a single post stores null thread_parts", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ thread_parts: null, text: "a" })] });
    await store.saveGeneratedDraft({ ...baseInput, posts: ["a"], mode: "create" });
    const queryParams = params(mocks.execute.mock.calls[0][0]);
    expect(queryParams).toContain("a");
    expect(queryParams.some((p) => typeof p === "string" && p.startsWith("["))).toBe(false);
  });

  it("returns the existing draft with created false on conflict", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.rows.mockResolvedValueOnce([dbDraft()]);
    const result = await store.saveGeneratedDraft({ ...baseInput, mode: "create" });
    expect(result).toMatchObject({ ok: true, created: false, draft: { id: "d1" } });
    expect(render(mocks.wheres[0])).toContain('"brand_id" = $');
  });

  it("redraft mode is guarded by revision and writes a generated revision", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ revision: 2 })] });
    const result = await store.saveGeneratedDraft({ ...baseInput, mode: { expectedRevision: 1 } });
    expect(result).toMatchObject({ ok: true, created: false });
    const text = render(mocks.execute.mock.calls[0][0]);
    expect(text).toContain('"revision" = $');
    expect(text).toContain("'generated'");
    expect(text).toContain('"brand_id" = $');
    expect(text).toMatch(/"status" in \(/);
    expect(text).toContain('"revision" = "revision" + 1');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("redraft on an old revision is stale", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.rows.mockResolvedValueOnce([dbDraft({ revision: 4 })]);
    expect(await store.saveGeneratedDraft({ ...baseInput, mode: { expectedRevision: 1 } })).toMatchObject({
      ok: false,
      reason: "stale",
      draft: { revision: 4 },
    });
  });

  it("redraft of a missing draft is not_found", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.rows.mockResolvedValueOnce([]);
    expect(await store.saveGeneratedDraft({ ...baseInput, mode: { expectedRevision: 1 } })).toMatchObject({
      ok: false,
      reason: "not_found",
      draft: null,
    });
  });
});

describe("ideas", () => {
  it("createIdea sets draftRequestedAt and keeps requested as given", async () => {
    const requested = { platforms: ["x" as const], pieces: [] };
    mocks.rows.mockResolvedValueOnce([
      {
        id: "i1",
        brandId: "b1",
        text: "idea",
        sourceKind: "text",
        sourceChannel: "studio",
        sourceRef: null,
        requested,
        draftRequestedAt: new Date(NOW),
        createdAt: new Date(NOW),
      },
    ]);
    const idea = await store.createIdea({
      brandId: "b1",
      userId: "u1",
      text: "idea",
      sourceKind: "text",
      sourceChannel: "studio",
      requested,
    });
    const values = mocks.values.mock.calls[0][0] as Record<string, unknown>;
    expect(values.draftRequestedAt).toBeTruthy();
    expect(values.requested).toBe(requested);
    expect(values.brandId).toBe("b1");
    expect(idea.draftRequestedAt).toBe(NOW);
  });
});

describe("saveContentPiece", () => {
  const piece = {
    id: "p1",
    ideaId: "i1",
    brandId: "b1",
    kind: "reel_script",
    title: "t",
    body: {},
    mediaIds: [],
    createdAt: new Date(NOW),
    updatedAt: new Date(NOW),
  };
  const input = {
    brandId: "b1",
    ideaId: "i1",
    kind: "reel_script" as const,
    title: "t",
    body: { hook: "", beats: [], caption: "", notes: "" },
  };

  it("create uses onConflictDoNothing on (idea_id, kind)", async () => {
    mocks.rows.mockResolvedValueOnce([piece]);
    const result = await store.saveContentPiece({ ...input, mode: "create" });
    expect(result.created).toBe(true);
    expect(mocks.onConflictDoNothing).toHaveBeenCalledTimes(1);
    expect(mocks.onConflictDoUpdate).not.toHaveBeenCalled();
    const target = (mocks.onConflictDoNothing.mock.calls[0][0] as { target: { name: string }[] }).target;
    expect(target.map((c) => c.name)).toEqual(["idea_id", "kind"]);
  });

  it("create returns the existing piece with created false", async () => {
    mocks.rows.mockResolvedValueOnce([]).mockResolvedValueOnce([piece]);
    const result = await store.saveContentPiece({ ...input, mode: "create" });
    expect(result).toMatchObject({ created: false, piece: { id: "p1" } });
    expect(render(mocks.wheres[0])).toContain('"brand_id" = $');
  });

  it("replace uses onConflictDoUpdate guarded by brand", async () => {
    mocks.rows.mockResolvedValueOnce([{ ...piece, updatedAt: new Date("2026-10-24T11:00:00.000Z") }]);
    const result = await store.saveContentPiece({ ...input, mode: "replace" });
    expect(result.created).toBe(false);
    expect(mocks.onConflictDoUpdate).toHaveBeenCalledTimes(1);
    const arg = mocks.onConflictDoUpdate.mock.calls[0][0] as { setWhere: unknown };
    expect(render(arg.setWhere)).toContain('"brand_id" = $');
  });
});

describe("brand scoping", () => {
  it("getDraft filters on brand_id", async () => {
    mocks.rows.mockResolvedValueOnce([]);
    expect(await store.getDraft("b1", "d1")).toBeNull();
    expect(render(mocks.wheres[0])).toContain('"brand_id" = $');
  });

  it("listDraftsForIdea filters on brand_id", async () => {
    mocks.rows.mockResolvedValueOnce([]);
    await store.listDraftsForIdea("b1", "i1");
    expect(render(mocks.wheres[0])).toContain('"brand_id" = $');
  });

  it("listDrafts, getIdea and listPiecesForIdea filter on brand_id", async () => {
    mocks.rows.mockResolvedValue([]);
    await store.listDrafts("b1", { status: "approved", limit: 10 });
    await store.getIdea("b1", "i1");
    await store.listPiecesForIdea("b1", "i1");
    expect(mocks.wheres).toHaveLength(3);
    for (const where of mocks.wheres) expect(render(where)).toContain('"brand_id" = $');
  });

  it("setDraftMedia filters on brand_id and revision", async () => {
    mocks.rows.mockResolvedValueOnce([{ id: "d1" }]);
    expect(await store.setDraftMedia({ brandId: "b1", draftId: "d1", revision: 2, mediaIds: ["m1"] })).toBe(true);
    const text = render(mocks.wheres[0]);
    expect(text).toContain('"brand_id" = $');
    expect(text).toContain('"revision" = $');
  });

  it("setPieceMedia filters on brand_id and reports no match", async () => {
    mocks.rows.mockResolvedValueOnce([]);
    expect(await store.setPieceMedia({ brandId: "b1", pieceId: "p1", mediaIds: [] })).toBe(false);
    expect(render(mocks.wheres[0])).toContain('"brand_id" = $');
  });

  it("markIdeaRequested filters on brand_id", async () => {
    mocks.rows.mockResolvedValueOnce([]);
    expect(await store.markIdeaRequested("b1", "i1")).toBeNull();
    expect(render(mocks.wheres[0])).toContain('"brand_id" = $');
  });
});
