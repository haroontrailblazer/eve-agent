import { getTableName } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { beforeEach, describe, expect, it, vi } from "vitest";

type Recorded = {
  table: string;
  joined: boolean;
  where: unknown;
  orderBy: unknown[];
  limit: number | null;
};

const mocks = vi.hoisted(() => ({
  queries: [] as Recorded[],
  results: {} as Record<string, unknown[]>,
  getBrandSettings: vi.fn(),
  findWhatsAppRecipient: vi.fn(),
  isWhatsAppConfigured: vi.fn(),
  tableName: undefined as unknown as (t: unknown) => string,
}));

vi.mock("@/lib/db/channel-identities", () => ({ findWhatsAppRecipient: mocks.findWhatsAppRecipient }));
vi.mock("@/lib/whatsapp/config", () => ({ isWhatsAppConfigured: mocks.isWhatsAppConfigured }));
vi.mock("@/lib/db/brands", () => ({ getBrandSettings: mocks.getBrandSettings }));
vi.mock("@/lib/db/client", () => ({
  db: {
    select: () => {
      const q: Recorded = { table: "", joined: false, where: null, orderBy: [], limit: null };
      const chain: Record<string, unknown> = {
        from: (t: unknown) => {
          q.table = mocks.tableName(t);
          return chain;
        },
        innerJoin: () => {
          q.joined = true;
          return chain;
        },
        where: (w: unknown) => {
          q.where = w;
          return chain;
        },
        orderBy: (...o: unknown[]) => {
          q.orderBy = o;
          return chain;
        },
        limit: (n: number) => {
          q.limit = n;
          return chain;
        },
        then: (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
          mocks.queries.push(q);
          const key = q.joined ? `${q.table}+join` : q.table;
          return Promise.resolve(mocks.results[key] ?? []).then(resolve, reject);
        },
      };
      return chain;
    },
  },
}));

mocks.tableName = (t) => getTableName(t as never);
const { loadStudioSnapshot, STUDIO_IDEA_LIMIT, UP_NEXT_LIMIT } = await import("@/lib/studio/snapshot");

const dialect = new PgDialect();
const render = (node: unknown) => dialect.sqlToQuery(node as never);
const ts = (iso: string) => new Date(iso);

const ideaRow = (id: string) => ({
  id,
  brandId: "brand-1",
  createdByUserId: null,
  text: "t",
  sourceKind: "text",
  sourceChannel: "studio",
  sourceRef: null,
  requested: { platforms: ["x", "linkedin", "threads"], pieces: [] },
  draftRequestedAt: null,
  createdAt: ts("2026-10-24T08:00:00Z"),
});
const draftRow = (id: string, platform: string, mediaIds: string[] = []) => ({
  id,
  ideaId: "i1",
  brandId: "brand-1",
  platform,
  status: "pending_review",
  revision: 1,
  hook: "",
  text: "hi",
  threadParts: null,
  mediaIds,
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
  createdAt: ts("2026-10-24T08:00:00Z"),
  updatedAt: ts("2026-10-24T08:00:00Z"),
});

beforeEach(() => {
  mocks.queries.length = 0;
  mocks.results = {};
  mocks.getBrandSettings.mockReset().mockResolvedValue({ timezone: "Asia/Kolkata", name: "b" });
  mocks.isWhatsAppConfigured.mockReset().mockReturnValue(true);
  mocks.findWhatsAppRecipient.mockReset().mockResolvedValue("15551234567");
});

describe("loadStudioSnapshot", () => {
  it("excludes eval ideas, scopes every query to the brand and orders upNext", async () => {
    mocks.results = { idea: [ideaRow("i1")], "draft+join": [{ draft: draftRow("d9", "x") }] };
    const snap = await loadStudioSnapshot("brand-1", "user-1");

    expect(snap.timezone).toBe("Asia/Kolkata");
    expect(mocks.getBrandSettings).toHaveBeenCalledWith("brand-1");
    expect(mocks.queries.length).toBeGreaterThanOrEqual(4);
    for (const q of mocks.queries) {
      const { sql, params } = render(q.where);
      expect(sql, q.table).toContain('"brand_id"');
      expect(params, q.table).toContain("brand-1");
    }

    const ideaQuery = mocks.queries.find((q) => q.table === "idea" && !q.joined);
    if (!ideaQuery) throw new Error("no idea query");
    const ideaWhere = render(ideaQuery.where);
    expect(ideaWhere.sql).toContain('"source_channel" <> $');
    expect(ideaWhere.params).toContain("eval");
    expect(ideaQuery.limit).toBe(STUDIO_IDEA_LIMIT);
    expect(render(ideaQuery.orderBy[0]).sql).toContain("desc");

    const upNext = mocks.queries.find((q) => q.joined);
    if (!upNext) throw new Error("no upNext query");
    expect(render(upNext.where).params).toEqual(expect.arrayContaining(["approved", "eval"]));
    expect(upNext.limit).toBe(UP_NEXT_LIMIT);
    expect(render(upNext.orderBy[0]).sql).toContain('"scheduled_at" asc nulls last');
    expect(render(upNext.orderBy[1]).sql).toContain('"approved_at"');
    expect(snap.upNext.map((d) => d.id)).toEqual(["d9"]);
  });

  it("returns an idea's drafts in x, linkedin, threads order", async () => {
    mocks.results = {
      idea: [ideaRow("i1")],
      draft: [draftRow("t", "threads"), draftRow("l", "linkedin"), draftRow("x", "x")],
    };
    const snap = await loadStudioSnapshot("brand-1", "user-1");
    expect(snap.ideas[0].drafts.map((d) => d.platform)).toEqual(["x", "linkedin", "threads"]);
  });

  it("looks images up in one brand-scoped query", async () => {
    mocks.results = {
      idea: [ideaRow("i1")],
      draft: [draftRow("x", "x", ["m1", "m2"]), draftRow("l", "linkedin", ["m3"]), draftRow("t", "threads")],
      media_asset: [
        { id: "m1", blobUrl: "https://blob/m1.png" },
        { id: "m3", blobUrl: "https://blob/m3.png" },
      ],
    };
    const snap = await loadStudioSnapshot("brand-1", "user-1");
    expect(mocks.queries.filter((q) => q.table === "media_asset")).toHaveLength(1);
    expect(snap.ideas[0].drafts.map((d) => d.imageUrl)).toEqual([
      "https://blob/m1.png",
      "https://blob/m3.png",
      null,
    ]);
  });

  it("skips the media query when nothing has media", async () => {
    const snap = await loadStudioSnapshot("brand-1", "user-1");
    expect(snap.ideas).toEqual([]);
    expect(mocks.queries.map((q) => q.table)).not.toContain("media_asset");
  });

  it("marks whatsapp linked when it is configured and the viewer has a number", async () => {
    const snap = await loadStudioSnapshot("brand-1", "user-1");
    expect(snap.whatsappLinked).toBe(true);
    expect(mocks.findWhatsAppRecipient).toHaveBeenCalledWith("brand-1", "user-1");
  });

  it("is not linked when the viewer has no number", async () => {
    mocks.findWhatsAppRecipient.mockResolvedValue(null);
    expect((await loadStudioSnapshot("brand-1", "user-1")).whatsappLinked).toBe(false);
  });

  it("is not linked, and looks nothing up, when whatsapp is not configured", async () => {
    mocks.isWhatsAppConfigured.mockReturnValue(false);
    expect((await loadStudioSnapshot("brand-1", "user-1")).whatsappLinked).toBe(false);
    expect(mocks.findWhatsAppRecipient).not.toHaveBeenCalled();
  });
});
