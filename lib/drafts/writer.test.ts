import { describe, expect, it } from "vitest";
import {
  buildWriterMessage,
  normalizeSuggestedTime,
  parseWriterOutput,
  postsForPlatform,
} from "@/lib/drafts/writer";

const now = new Date("2026-10-24T10:00:00Z");
describe("normalizeSuggestedTime", () => {
  it("keeps a time 2 days out", () => expect(normalizeSuggestedTime("2026-10-26T09:30:00+05:30", now)).toBe("2026-10-26T04:00:00.000Z"));
  it.each([["past", "2026-10-23T09:00:00Z"], ["5 minutes", "2026-10-24T10:05:00Z"], ["too far", "2026-11-20T09:00:00Z"], ["junk", "Tuesday morning"]])(
    "drops %s", (_label, value) => expect(normalizeSuggestedTime(value, now)).toBeNull());
  it("passes null through", () => expect(normalizeSuggestedTime(null, now)).toBeNull());
});
describe("postsForPlatform", () => {
  it("joins LinkedIn parts", () => expect(postsForPlatform("linkedin", ["a ", "", " b"])).toEqual(["a\n\nb"]));
  it("keeps X thread parts", () => expect(postsForPlatform("x", ["a", " b "])).toEqual(["a", "b"]));
});
describe("buildWriterMessage", () => {
  const brief = { target: { kind: "post", platform: "x" }, now: now.toISOString(), timezone: "Asia/Kolkata", voiceGuide: "Write plainly.",
    preferences: ["No hashtags"], exemplars: [{ platform: "x", text: "Ship it." }], idea: "Small teams ship faster",
    sources: [{ url: "https://a.co", title: "A", text: "s".repeat(30_000) }], allowLinksOnX: false } as const;
  const message = buildWriterMessage(brief);
  it("orders the sections", () => {
    const order = ["## Task", "## Now", "## Platform rules", "## Voice guide", "## Owner preferences", "## Examples of the owner's posts", "## Idea", "## Sources", "## Output"]
      .map((h) => message.indexOf(h));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!))).toBe(true);
  });
  it("truncates a long source", () => { expect(message).toContain("[truncated]"); expect(message.length).toBeLessThan(20_000); });
  it("forbids links on X unless allowed", () => {
    expect(message).toContain("Do not include links.");
    expect(buildWriterMessage({ ...brief, allowLinksOnX: true })).not.toContain("Do not include links.");
  });
  it("shows the zone", () => expect(message).toContain("Asia/Kolkata"));
});
describe("parseWriterOutput", () => {
  it("rejects a platform mismatch", () => expect(parseWriterOutput({ kind: "post", platform: "x" },
    { platform: "linkedin", hook: "h", posts: ["p"], imagePrompt: null, suggestedTime: null, notes: "" })).toMatchObject({ ok: false }));
  it("rejects the wrong shape", () => expect(parseWriterOutput({ kind: "piece", piece: "reel_script" }, { posts: [] })).toMatchObject({ ok: false }));
});
