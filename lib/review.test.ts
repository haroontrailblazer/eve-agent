import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DraftRecord } from "@/lib/drafts/records";

const mocks = vi.hoisted(() => {
  const getDraftRows = vi.fn();
  const chain: Record<string, unknown> = {};
  for (const name of ["from", "where", "limit", "orderBy"]) chain[name] = () => chain;
  chain.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(getDraftRows()).then(resolve, reject);
  return { execute: vi.fn(), getDraftRows, select: vi.fn(() => chain) };
});

vi.mock("@/lib/db/client", () => ({ db: { execute: mocks.execute, select: mocks.select } }));

const {
  approveDraft,
  clearRevisionRequest,
  completeRevision,
  failureFor,
  requestRevision,
  restoreDraft,
  reviewFailureMessage,
  saveManualEdit,
  setProposedTime,
  skipDraft,
} = await import("@/lib/review");

const NOW = "2026-10-24T10:00:00.000Z";

function rawRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    idea_id: "i1",
    brand_id: "b1",
    platform: "x",
    status: "pending_review",
    revision: 2,
    hook: "h",
    text: "t",
    thread_parts: null,
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

function draftRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "d1",
    ideaId: "i1",
    brandId: "b1",
    platform: "x",
    status: "pending_review",
    revision: 2,
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

function record(overrides: Partial<DraftRecord> = {}): DraftRecord {
  return {
    id: "d1",
    ideaId: "i1",
    brandId: "b1",
    platform: "x",
    status: "pending_review",
    revision: 2,
    hook: "h",
    text: "t",
    posts: ["t"],
    mediaIds: [],
    imagePrompt: null,
    scheduledAt: null,
    approvedAt: null,
    approvedVia: null,
    notes: "",
    revisionRequestedAt: null,
    externalUrl: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

function render(query: unknown) {
  return new PgDialect().sqlToQuery(query as Parameters<PgDialect["sqlToQuery"]>[0]).sql;
}

beforeEach(() => {
  mocks.execute.mockReset();
  mocks.getDraftRows.mockReset();
});

describe("review actions", () => {
  it("approve is guarded by brand, revision and state", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ status: "approved", approved_via: "web" })] });
    const result = await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" });
    expect(result).toMatchObject({ ok: true, draft: { status: "approved", approvedVia: "web" } });
    const text = render(mocks.execute.mock.calls[0][0]);
    expect(text).toContain('"brand_id" = $');
    expect(text).toContain('"revision" = $');
    expect(text).toMatch(/"status" in \(/);
    expect(text).toContain('"approved_at" = now()');
    expect(text).toContain('"updated_at" = now()');
  });

  it("approve on an approved draft reports invalid_state with the current draft", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.getDraftRows.mockResolvedValueOnce([draftRow({ status: "approved", revision: 2 })]);
    expect(await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" })).toMatchObject({
      ok: false,
      reason: "invalid_state",
      draft: { status: "approved" },
    });
  });

  it("a save on an old revision is stale", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.getDraftRows.mockResolvedValueOnce([draftRow({ revision: 3 })]);
    expect(
      await saveManualEdit({ brandId: "b1", draftId: "d1", expectedRevision: 2, posts: ["new"], userId: "u1" }),
    ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("a manual edit writes the draft and its revision in one statement", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ revision: 3, text: "new" })] });
    await saveManualEdit({ brandId: "b1", draftId: "d1", expectedRevision: 2, posts: ["new"], userId: "u1" });
    const text = render(mocks.execute.mock.calls[0][0]);
    expect(text).toMatch(/^\s*with upd as \(\s*update "draft"/i);
    expect(text).toContain('insert into "draft_revision"');
    expect(text).toContain("'manual_edit'");
    expect(text).toContain('"revision" = "revision" + 1');
    expect(text).toContain('"approved_at" = null');
    expect(text).toContain('"approved_via" = null');
    expect(text).toContain('"revision_requested_at" = null');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("a missing draft is not_found", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.getDraftRows.mockResolvedValueOnce([]);
    expect(await skipDraft({ brandId: "b1", draftId: "nope", expectedRevision: 1 })).toMatchObject({
      ok: false,
      reason: "not_found",
      draft: null,
    });
  });

  it("completeRevision stores the instruction as a user_edit_request", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ revision: 3 })] });
    await completeRevision({
      brandId: "b1",
      draftId: "d1",
      expectedRevision: 2,
      hook: "h",
      posts: ["a", "b"],
      imagePrompt: null,
      instruction: "shorter",
      userId: null,
    });
    const text = render(mocks.execute.mock.calls[0][0]);
    expect(text).toContain("'user_edit_request'");
    expect(text).toContain('insert into "draft_revision"');
    expect(mocks.execute).toHaveBeenCalledTimes(1);
  });

  it("restore touches only status and requires skipped", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [rawRow()] });
    await restoreDraft({ brandId: "b1", draftId: "d1" });
    const text = render(mocks.execute.mock.calls[0][0]);
    expect(text).toContain('"brand_id" = $');
    expect(text).not.toContain('"revision" = $');
    expect(text).not.toContain("approved_at");
  });

  it("request revision, proposed time and clear are brand guarded", async () => {
    mocks.execute.mockResolvedValue({ rows: [rawRow()] });
    await requestRevision({ brandId: "b1", draftId: "d1", expectedRevision: 2 });
    await setProposedTime({ brandId: "b1", draftId: "d1", scheduledAt: null });
    await clearRevisionRequest("b1", "d1");
    for (const call of mocks.execute.mock.calls) expect(render(call[0])).toContain('"brand_id" = $');
    expect(render(mocks.execute.mock.calls[1][0])).toContain("'pending_review'");
  });

  it.each([
    ["not_found", null, 1],
    ["stale", 3, 2],
    ["invalid_state", 2, 2],
  ] as const)("failureFor gives %s", (reason, currentRevision, expected) =>
    expect(
      failureFor(currentRevision === null ? null : record({ revision: currentRevision }), expected, "approve"),
    ).toBe(reason),
  );

  it("failureFor without an expected revision never reports stale", () => {
    expect(failureFor(record({ revision: 9 }), null, "restore")).toBe("invalid_state");
  });

  it("uses the agreed copy", () => {
    expect(reviewFailureMessage("not_found")).toBe("That draft is gone.");
    expect(reviewFailureMessage("stale")).toBe("That draft changed. Showing the latest.");
    expect(reviewFailureMessage("invalid_state")).toBe("That draft can't do that right now.");
  });
});

describe("stale and status guards", () => {
  it("approve on a revision mismatch is stale", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.getDraftRows.mockResolvedValueOnce([draftRow({ revision: 5 })]);
    expect(await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" })).toMatchObject({
      ok: false,
      reason: "stale",
      draft: { revision: 5 },
    });
  });

  it("approve with expectedStatus on a now approved draft is stale with the current draft", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.getDraftRows.mockResolvedValueOnce([draftRow({ status: "approved" })]);
    expect(
      await approveDraft({
        brandId: "b1",
        draftId: "d1",
        expectedRevision: 2,
        via: "web",
        expectedStatus: "pending_review",
      }),
    ).toMatchObject({ ok: false, reason: "stale", draft: { status: "approved" } });
  });

  it("skip with expectedStatus after an approve is stale", async () => {
    mocks.execute.mockResolvedValueOnce({ rows: [] });
    mocks.getDraftRows.mockResolvedValueOnce([draftRow({ status: "approved" })]);
    expect(
      await skipDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, expectedStatus: "pending_review" }),
    ).toMatchObject({ ok: false, reason: "stale" });
  });

  it("the status = predicate is rendered only when expectedStatus is given", async () => {
    mocks.execute.mockResolvedValue({ rows: [rawRow()] });
    await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" });
    await approveDraft({
      brandId: "b1",
      draftId: "d1",
      expectedRevision: 2,
      via: "web",
      expectedStatus: "pending_review",
    });
    await skipDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2 });
    await skipDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, expectedStatus: "approved" });
    const texts = mocks.execute.mock.calls.map((call) => render(call[0]));
    expect(texts.map((text) => /and "status" = \$/.test(text))).toEqual([false, true, false, true]);
  });

  it("failureFor is stale when the status differs from the expected one", () => {
    expect(failureFor(record({ status: "approved" }), 2, "approve", "pending_review")).toBe("stale");
    expect(failureFor(record({ status: "approved" }), 2, "approve")).toBe("invalid_state");
    expect(failureFor(record({ status: "approved" }), 2, "approve", "approved")).toBe("invalid_state");
  });
});

describe("every write renders a brand guard", () => {
  it("covers each review write", async () => {
    mocks.execute.mockResolvedValue({ rows: [rawRow()] });
    await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" });
    await skipDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2 });
    await restoreDraft({ brandId: "b1", draftId: "d1" });
    await saveManualEdit({ brandId: "b1", draftId: "d1", expectedRevision: 2, posts: ["x"], userId: "u1" });
    await requestRevision({ brandId: "b1", draftId: "d1", expectedRevision: 2 });
    await completeRevision({
      brandId: "b1",
      draftId: "d1",
      expectedRevision: 2,
      hook: "h",
      posts: ["x"],
      imagePrompt: null,
      instruction: "i",
      userId: null,
    });
    await setProposedTime({ brandId: "b1", draftId: "d1", scheduledAt: null });
    await clearRevisionRequest("b1", "d1");
    expect(mocks.execute).toHaveBeenCalledTimes(8);
    for (const call of mocks.execute.mock.calls) expect(render(call[0])).toContain('"brand_id" = $');
  });
});
