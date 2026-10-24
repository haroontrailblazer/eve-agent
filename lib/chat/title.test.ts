import { describe, expect, it } from "vitest";
import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "@/lib/chat/title";

describe("createFallbackTitle", () => {
  it("collapses whitespace", () => expect(createFallbackTitle("  plan   the launch ")).toBe("plan the launch"));
  it("strips markdown marks", () => expect(createFallbackTitle("# **Plan** the `launch`")).toBe("Plan the launch"));
  it("falls back for blank input", () => expect(createFallbackTitle("   ")).toBe(DEFAULT_CHAT_TITLE));
  it("truncates to 72 chars with an ellipsis", () => {
    const title = createFallbackTitle("a".repeat(100));
    expect(title).toHaveLength(72);
    expect(title.endsWith("...")).toBe(true);
  });
});
