import { describe, expect, it } from "vitest";
import type { VoiceExample, VoiceGuide } from "@/lib/voice/store";
import { canRewriteGuide, guideChangedSince, versionLabel, type BrandVoiceSnapshot } from "@/lib/voice/view";

function guide(version: number, source: VoiceGuide["source"] = "harpy"): VoiceGuide {
  return {
    id: `g${version}`,
    brandId: "b1",
    version,
    body: "Body",
    source,
    note: "",
    createdAt: "2026-10-24T10:00:00.000Z",
  };
}

function example(id: string): VoiceExample {
  return { id, brandId: "b1", platform: null, text: "A past post of some length", source: "pasted", createdAt: "2026-10-24T10:00:00.000Z" };
}

function snapshot(version: number, examples: number): BrandVoiceSnapshot {
  const active = guide(version);
  return {
    guide: active,
    versions: [active],
    examples: Array.from({ length: examples }, (_, i) => example(`e${i}`)),
    preferences: [],
    timezone: "UTC",
  };
}

describe("canRewriteGuide", () => {
  it("needs at least 3 examples", () => {
    expect(canRewriteGuide(snapshot(1, 2))).toBe(false);
    expect(canRewriteGuide(snapshot(1, 3))).toBe(true);
  });
});

describe("versionLabel", () => {
  it("names the version, source and UTC date", () => {
    expect(versionLabel(guide(3))).toBe("Version 3 · by harpy · Oct 24");
  });

  it("labels each source", () => {
    expect(versionLabel(guide(1, "default"))).toContain("starter");
    expect(versionLabel(guide(2, "manual"))).toContain("by you");
    expect(versionLabel(guide(4, "restore"))).toContain("restored");
  });
});

describe("guideChangedSince", () => {
  it("is true only when the active version moved past the previous one", () => {
    expect(guideChangedSince(3, snapshot(4, 0))).toBe(true);
    expect(guideChangedSince(3, snapshot(3, 0))).toBe(false);
  });
});
