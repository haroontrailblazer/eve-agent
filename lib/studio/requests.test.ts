import { describe, expect, it } from "vitest";
import {
  buildDraftIdeaRequest,
  buildRevisionRequest,
  buildRewriteGuideRequest,
  extractLinks,
} from "@/lib/studio/requests";

describe("studio requests", () => {
  it("asks for draft_posts with the idea id and fetches links first", () => {
    const message = buildDraftIdeaRequest({ ideaId: "i1", ideaText: "Read https://a.co/x and https://a.co/x then post" });
    expect(message.startsWith("Studio request:")).toBe(true);
    expect(message).toContain('ideaId "i1"');
    expect(message).toContain("web_fetch");
    expect(message.match(/https:\/\/a\.co\/x/g)).toHaveLength(1);
  });

  it("leaves out web_fetch when there are no links", () =>
    expect(buildDraftIdeaRequest({ ideaId: "i1", ideaText: "No links" })).not.toContain("web_fetch"));

  it("fences the requested change", () =>
    expect(buildRevisionRequest({ draftId: "d1", platform: "x", instruction: "shorter" })).toContain(
      "<change>shorter</change>",
    ));

  it("names the draft id in a revision request", () => {
    const message = buildRevisionRequest({ draftId: "d1", platform: "linkedin", instruction: "shorter" });
    expect(message.startsWith("Studio request:")).toBe(true);
    expect(message).toContain("revise_draft");
    expect(message).toContain("d1");
  });

  it("asks to rewrite the guide through the voice tools", () => {
    const message = buildRewriteGuideRequest();
    expect(message.startsWith("Studio request:")).toBe(true);
    expect(message).toContain("list_voice_examples");
    expect(message).toContain("update_voice_guide");
  });

  it("caps links at 3", () =>
    expect(extractLinks("https://a.co/1 https://a.co/2 https://a.co/3 https://a.co/4")).toHaveLength(3));

  it("strips trailing punctuation and dedupes", () => {
    expect(extractLinks("See https://a.co/x. Also (https://b.co/y), https://a.co/x!")).toEqual([
      "https://a.co/x",
      "https://b.co/y",
    ]);
  });
});
