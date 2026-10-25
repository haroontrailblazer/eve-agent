import { describe, expect, it } from "vitest";
import { buildVoiceRecall, extractTurnText } from "@/lib/voice/memory";
import type { VoiceExample, VoicePreference } from "@/lib/voice/store";

const preference: VoicePreference = {
  id: "p1",
  brandId: "b1",
  text: "never use hashtags",
  source: "chat",
  createdAt: "2026-01-01T00:00:00.000Z",
};

function example(platform: VoiceExample["platform"]): VoiceExample {
  return { id: "e1", brandId: "b1", platform, text: "hello world", source: "pasted", createdAt: "2026-01-01T00:00:00.000Z" };
}

describe("buildVoiceRecall", () => {
  it("produces stable ids and content prefixes", () => {
    const { messages } = buildVoiceRecall({ preferences: [preference], exemplars: [example("linkedin"), example(null)] });
    expect(messages).toEqual([
      { id: "preference:p1", content: "Owner preference: never use hashtags" },
      { id: "example:e1", content: "An example of the owner's past LinkedIn writing:\nhello world" },
      { id: "example:e1", content: "An example of the owner's past post writing:\nhello world" },
    ]);
  });
});

describe("extractTurnText", () => {
  it("joins text parts and string content", () => {
    expect(
      extractTurnText([
        { role: "user", content: [{ type: "text", text: "a" }, { type: "file" }] },
        { role: "user", content: "b" },
      ]),
    ).toBe("a\nb");
  });

  it("returns an empty string for anything else", () => expect(extractTurnText(42)).toBe(""));
});
