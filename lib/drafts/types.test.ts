import { describe, expect, it } from "vitest";
import { isPieceKind, isSocialPlatform, targetKey } from "@/lib/drafts/types";

describe("isSocialPlatform", () => {
  it("accepts known platforms only", () => {
    expect(isSocialPlatform("x")).toBe(true);
    expect(isSocialPlatform("whatsapp")).toBe(false);
    expect(isSocialPlatform(undefined)).toBe(false);
  });
});

describe("isPieceKind", () => {
  it("accepts known piece kinds only", () => {
    expect(isPieceKind("carousel_outline")).toBe(true);
    expect(isPieceKind("x")).toBe(false);
  });
});

describe("targetKey", () => {
  it("keys posts and pieces", () => {
    expect(targetKey({ kind: "post", platform: "x" })).toBe("post:x");
    expect(targetKey({ kind: "piece", piece: "reel_script" })).toBe("piece:reel_script");
  });
});
