import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A recording stand-in for the drizzle client. Selects shift rows off
// `selectQueue`; inserts resolve to `insertReturn` (or echo their values).
const fake = vi.hoisted(() => {
  const state = {
    selectQueue: [] as unknown[][],
    insertReturn: null as unknown[] | null,
    inserts: [] as { values: unknown; conflict: unknown }[],
    deletes: [] as { where: unknown }[],
    deleteReturn: [] as unknown[],
  };

  class Query implements PromiseLike<unknown[]> {
    constructor(private readonly resolve: () => unknown[]) {}
    where(): this {
      return this;
    }
    orderBy(): this {
      return this;
    }
    limit(): this {
      return this;
    }
    returning(): Promise<unknown[]> {
      return Promise.resolve(this.resolve());
    }
    then<T, U>(
      onFulfilled?: (rows: unknown[]) => T | PromiseLike<T>,
      onRejected?: (reason: unknown) => U | PromiseLike<U>,
    ): Promise<T | U> {
      return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
    }
  }

  const echo = (values: unknown): unknown[] =>
    (Array.isArray(values) ? values : [values]).map((v) => ({ createdAt: new Date("2026-01-01T00:00:00Z"), ...v }));

  const db = {
    insert: () => ({
      values: (values: unknown) => {
        const record = { values, conflict: undefined as unknown };
        state.inserts.push(record);
        const query = new Query(() => state.insertReturn ?? echo(values));
        return Object.assign(query, {
          onConflictDoNothing: (conflict?: unknown) => {
            record.conflict = conflict ?? true;
            return query;
          },
        });
      },
    }),
    select: () => ({ from: () => new Query(() => state.selectQueue.shift() ?? []) }),
    delete: () => ({
      where: (where: unknown) => {
        state.deletes.push({ where });
        return new Query(() => state.deleteReturn);
      },
    }),
  };

  return { db, state };
});

vi.mock("@/lib/db/client", () => ({ db: fake.db }));

import { DEFAULT_VOICE_GUIDE } from "@/lib/content-guides/voice-default";
import {
  addVoiceExamples,
  deleteVoiceExample,
  getActiveVoiceGuide,
  restoreVoiceGuideVersion,
  saveVoiceGuideVersion,
} from "@/lib/voice/store";

const guideRow = (version: number, body = "body", source = "manual") => ({
  id: `g${version}`,
  brandId: "b1",
  version,
  body,
  source,
  note: "",
  createdByUserId: null,
  createdAt: new Date("2026-01-01T00:00:00Z"),
});

beforeEach(() => {
  fake.state.selectQueue = [];
  fake.state.insertReturn = null;
  fake.state.inserts = [];
  fake.state.deletes = [];
  fake.state.deleteReturn = [];
});

describe("getActiveVoiceGuide", () => {
  it("seeds version 1 from the default when the brand has none", async () => {
    fake.state.selectQueue = [[], [guideRow(1, DEFAULT_VOICE_GUIDE, "default")]];
    const guide = await getActiveVoiceGuide("b1");
    expect(fake.state.inserts).toHaveLength(1);
    expect(fake.state.inserts[0]?.values).toMatchObject({
      brandId: "b1",
      version: 1,
      source: "default",
      body: DEFAULT_VOICE_GUIDE,
    });
    expect(fake.state.inserts[0]?.conflict).toBeTruthy();
    expect(guide.version).toBe(1);
    expect(guide.createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("does not insert when a guide exists", async () => {
    fake.state.selectQueue = [[guideRow(4)]];
    expect((await getActiveVoiceGuide("b1")).version).toBe(4);
    expect(fake.state.inserts).toHaveLength(0);
  });
});

describe("saveVoiceGuideVersion", () => {
  const base = { brandId: "b1", source: "manual" as const, userId: "u1", basedOnVersion: 3 };

  it("inserts the next version", async () => {
    fake.state.insertReturn = [guideRow(4, "new body")];
    const result = await saveVoiceGuideVersion({ ...base, body: "  new body  " });
    expect(fake.state.inserts[0]?.values).toMatchObject({
      version: 4,
      body: "new body",
      source: "manual",
      createdByUserId: "u1",
    });
    expect(result).toMatchObject({ ok: true, guide: { version: 4 } });
  });

  it("reports stale with the latest guide when the insert conflicts", async () => {
    fake.state.insertReturn = [];
    fake.state.selectQueue = [[guideRow(5)]];
    const result = await saveVoiceGuideVersion({ ...base, body: "x" });
    expect(result).toMatchObject({ ok: false, reason: "stale", latest: { version: 5 } });
  });

  it("throws on a blank body", async () => {
    await expect(saveVoiceGuideVersion({ ...base, body: "   " })).rejects.toThrow();
  });

  it("throws on an oversized body", async () => {
    await expect(saveVoiceGuideVersion({ ...base, body: "a".repeat(12_001) })).rejects.toThrow();
  });
});

describe("restoreVoiceGuideVersion", () => {
  it("copies the chosen version into a new top version", async () => {
    // First select is the chosen version, second is the latest.
    fake.state.selectQueue = [[guideRow(2, "old body")], [guideRow(5)]];
    fake.state.insertReturn = [guideRow(6, "old body", "restore")];
    const result = await restoreVoiceGuideVersion({ brandId: "b1", version: 2, userId: "u1" });
    expect(fake.state.inserts[0]?.values).toMatchObject({
      version: 6,
      body: "old body",
      source: "restore",
      note: "Restored version 2",
    });
    expect(result.ok).toBe(true);
  });

  it("returns not_found for a missing version", async () => {
    fake.state.selectQueue = [[]];
    expect(await restoreVoiceGuideVersion({ brandId: "b1", version: 9, userId: "u1" })).toEqual({
      ok: false,
      reason: "not_found",
    });
  });
});

describe("addVoiceExamples", () => {
  it("drops short texts and inserts the rest in one statement", async () => {
    const ok1 = "a".repeat(30);
    const ok2 = "b".repeat(40);
    const out = await addVoiceExamples({ brandId: "b1", platform: "x", texts: [ok1, "0123456789", `  ${ok2}  `] });
    expect(fake.state.inserts).toHaveLength(1);
    const values = fake.state.inserts[0]?.values as { text: string; brandId: string; source: string }[];
    expect(values.map((v) => v.text)).toEqual([ok1, ok2]);
    expect(values.every((v) => v.brandId === "b1" && v.source === "pasted")).toBe(true);
    expect(out).toHaveLength(2);
  });

  it("does nothing when every text is dropped", async () => {
    expect(await addVoiceExamples({ brandId: "b1", platform: null, texts: ["short"] })).toEqual([]);
    expect(fake.state.inserts).toHaveLength(0);
  });
});

describe("deleteVoiceExample", () => {
  it("filters on id and brand_id", async () => {
    fake.state.deleteReturn = [{ id: "e1" }];
    expect(await deleteVoiceExample("b1", "e1")).toBe(true);
    const query = new PgDialect().sqlToQuery(fake.state.deletes[0]?.where as SQL);
    expect(query.sql).toContain('"id" = $');
    expect(query.sql).toContain('"brand_id" = $');
    expect(query.params).toEqual(expect.arrayContaining(["b1", "e1"]));
  });

  it("returns false when nothing matched", async () => {
    expect(await deleteVoiceExample("b1", "nope")).toBe(false);
  });
});
