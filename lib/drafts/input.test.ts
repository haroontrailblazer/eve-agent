import { describe, expect, it } from "vitest";
import { DRAFT_POSTS_INPUT, ideaSourceChannel, resolveTargets } from "@/lib/drafts/input";

const X = { kind: "post", platform: "x" } as const;
const LINKEDIN = { kind: "post", platform: "linkedin" } as const;
const THREADS = { kind: "post", platform: "threads" } as const;
const REEL = { kind: "piece", piece: "reel_script" } as const;
const CAROUSEL = { kind: "piece", piece: "carousel_outline" } as const;

describe("resolveTargets", () => {
  it("defaults to the three platforms", () => {
    expect(resolveTargets({}, null)).toEqual([X, LINKEDIN, THREADS]);
  });

  it("drafts only the pieces asked for", () => {
    expect(resolveTargets({ pieces: ["reel_script"] }, null)).toEqual([REEL]);
  });

  it("uses the idea's requested set when the input names none", () => {
    expect(resolveTargets({}, { platforms: ["threads"], pieces: ["carousel_outline"] })).toEqual([THREADS, CAROUSEL]);
  });

  it("lets explicit input win over the idea's requested set", () => {
    expect(resolveTargets({ platforms: ["linkedin"] }, { platforms: ["x"], pieces: [] })).toEqual([LINKEDIN]);
  });

  it("falls back to the three platforms when the requested set is empty", () => {
    expect(resolveTargets({ platforms: [], pieces: [] }, { platforms: [], pieces: [] })).toEqual([X, LINKEDIN, THREADS]);
  });

  it("removes duplicates and lists platforms first in x, linkedin, threads order", () => {
    expect(
      resolveTargets({ platforms: ["threads", "x", "threads"], pieces: ["carousel_outline", "reel_script", "reel_script"] }, null),
    ).toEqual([X, THREADS, REEL, CAROUSEL]);
  });
});

describe("DRAFT_POSTS_INPUT", () => {
  it("accepts an idea with sources", () => {
    expect(
      DRAFT_POSTS_INPUT.safeParse({ idea: "Small teams ship faster", sources: [{ url: "https://a.co", text: "Body" }] }).success,
    ).toBe(true);
  });

  it("rejects an idea of 8,001 characters", () => {
    expect(DRAFT_POSTS_INPUT.safeParse({ idea: "a".repeat(8_001) }).success).toBe(false);
  });

  it("rejects 4 sources", () => {
    const sources = Array.from({ length: 4 }, (_, n) => ({ text: `Source ${n}` }));
    expect(DRAFT_POSTS_INPUT.safeParse({ idea: "Idea", sources }).success).toBe(false);
  });

  it("asks for at most 12,000 characters of main text a source but accepts more", () => {
    const text = DRAFT_POSTS_INPUT.shape.sources.unwrap().element.shape.text;
    expect(text.description).toBe(
      "The article's main text, at most 12,000 characters. Skip navigation, footers and comments.",
    );
    expect(DRAFT_POSTS_INPUT.safeParse({ idea: "Idea", sources: [{ text: "a".repeat(30_000) }] }).success).toBe(true);
  });

  it("rejects a source without text", () => {
    expect(DRAFT_POSTS_INPUT.safeParse({ idea: "Idea", sources: [{ url: "https://a.co", text: "" }] }).success).toBe(false);
  });

  it("rejects an unknown platform", () => {
    expect(DRAFT_POSTS_INPUT.safeParse({ idea: "Idea", platforms: ["myspace"] }).success).toBe(false);
  });
});

describe("ideaSourceChannel", () => {
  it("keeps a known channel", () => {
    expect(ideaSourceChannel({ channel: "whatsapp" })).toBe("whatsapp");
    expect(ideaSourceChannel({ channel: "eval" })).toBe("eval");
  });

  it("gives web for an unknown or missing channel", () => {
    expect(ideaSourceChannel({ channel: "fax" })).toBe("web");
    expect(ideaSourceChannel(undefined)).toBe("web");
  });

  it("never gives studio, which only createIdeaAction sets", () => {
    expect(ideaSourceChannel({ channel: "studio" })).toBe("web");
  });
});
