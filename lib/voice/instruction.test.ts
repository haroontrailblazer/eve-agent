import { describe, expect, it } from "vitest";
import { formatVoiceGuideInstruction } from "@/lib/voice/instruction";
import type { VoiceGuide } from "@/lib/voice/store";

describe("formatVoiceGuideInstruction", () => {
  it("carries the version and the body verbatim", () => {
    const guide: VoiceGuide = {
      id: "g",
      brandId: "b",
      version: 4,
      body: "Short.\n\nPlain.",
      source: "manual",
      note: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    expect(formatVoiceGuideInstruction(guide)).toBe(
      "# Brand voice guide (version 4)\n\nShort.\n\nPlain.\n\nWrite everything for the owner in this voice.",
    );
  });
});
