import { describe, expect, it } from "vitest";
import { keywordSet, selectExemplars } from "@/lib/voice/exemplars";

const ex = (id: string, text: string, platform: "x" | "linkedin" | null, createdAt: string) =>
  ({ id, brandId: "b", platform, text, source: "pasted" as const, createdAt });

describe("selectExemplars", () => {
  const examples = [
    ex("old-linkedin", "Hiring engineers is mostly about writing", "linkedin", "2026-01-01T00:00:00Z"),
    ex("new-x", "Pricing pages lie about pricing", "x", "2026-03-01T00:00:00Z"),
    ex("match-x", "Hiring engineers taught me pricing", "x", "2026-02-01T00:00:00Z"),
  ];
  it("prefers keyword overlap, then platform, then recency", () => {
    expect(selectExemplars(examples, { text: "what hiring engineers taught me", platform: "x", limit: 2 }).map((e) => e.id))
      .toEqual(["match-x", "old-linkedin"]);
  });
  it("falls back to recency when nothing overlaps", () => {
    expect(selectExemplars(examples, { text: "zzz", platform: null, limit: 1 }).map((e) => e.id)).toEqual(["new-x"]);
  });
  it("drops short words and stopwords", () => expect([...keywordSet("This is about Hiring, with Joy")]).toEqual(["hiring"]));
});
