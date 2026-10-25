import { describe, expect, it } from "vitest";
import { ANTI_AI_RULES, BANNED_PATTERNS } from "@/lib/content-guides/anti-ai";
import { VIRAL_HOOKS_GUIDE } from "@/lib/content-guides/hooks";
import { PLATFORM_GUIDES } from "@/lib/content-guides/platforms";
import { PIECE_GUIDES, REPURPOSE_GUIDE } from "@/lib/content-guides/repurpose";
import { DEFAULT_VOICE_GUIDE } from "@/lib/content-guides/voice-default";

describe("content guides", () => {
  it("carries the platform numbers", () => {
    expect(PLATFORM_GUIDES.x).toContain("280");
    expect(PLATFORM_GUIDES.x).toContain("$0.20");
    expect(PLATFORM_GUIDES.threads).toContain("500");
    expect(PLATFORM_GUIDES.linkedin).toContain("3,000");
  });
  it("carries the writing rules", () => {
    expect(ANTI_AI_RULES).toContain("em dash");
    expect(DEFAULT_VOICE_GUIDE).toContain("sentence case");
    expect(DEFAULT_VOICE_GUIDE).toContain("straight quotes");
  });
  it("lists every banned label for the writer", () => {
    for (const { label } of BANNED_PATTERNS) expect(ANTI_AI_RULES).toContain(label);
  });
  it("uses no em dash in any guide", () => {
    const all = [
      ANTI_AI_RULES,
      VIRAL_HOOKS_GUIDE,
      REPURPOSE_GUIDE,
      DEFAULT_VOICE_GUIDE,
      ...Object.values(PLATFORM_GUIDES),
      ...Object.values(PIECE_GUIDES),
    ];
    for (const guide of all) expect(guide).not.toContain("—");
  });
});
