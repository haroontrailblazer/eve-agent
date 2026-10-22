import { describe, expect, it } from "vitest";
import { isValidPlatformKey } from "@/lib/mcp-platform-key";

describe("isValidPlatformKey", () => {
  it.each(["notion", "my-server-2", "a", "a".repeat(40)])("accepts %j", (key) => {
    expect(isValidPlatformKey(key)).toBe(true);
  });

  it.each(["", "<b>", "a".repeat(41), "Notion", "has space", "under_score", "new\nline"])(
    "rejects %j",
    (key) => {
      expect(isValidPlatformKey(key)).toBe(false);
    },
  );
});
