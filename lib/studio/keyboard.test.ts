import { describe, expect, it } from "vitest";
import { keyToAction, moveSelection } from "@/lib/studio/keyboard";

const key = (k: string, extra: Partial<Parameters<typeof keyToAction>[0]> = {}) =>
  keyToAction({ key: k, metaKey: false, ctrlKey: false, altKey: false, target: { tagName: "DIV" }, ...extra });

describe("keyToAction", () => {
  it.each([
    ["j", { type: "move", delta: 1 }],
    ["K", { type: "move", delta: -1 }],
    ["a", { type: "approve" }],
    ["e", { type: "edit" }],
    ["s", { type: "skip" }],
    ["?", { type: "help" }],
  ] as const)("%s maps", (k, action) => expect(key(k)).toEqual(action));

  it.each(["A", "E", "S", "J"])("treats %s (Shift or Caps Lock) like the lowercase key", (k) =>
    expect(key(k)).toEqual(key(k.toLowerCase())),
  );

  it.each(["INPUT", "TEXTAREA", "SELECT"])("ignores keys typed in %s", (tagName) =>
    expect(key("a", { target: { tagName } })).toBeNull(),
  );

  it("ignores contentEditable and modifiers", () => {
    expect(key("a", { target: { isContentEditable: true } })).toBeNull();
    expect(key("s", { metaKey: true })).toBeNull();
    expect(key("j", { ctrlKey: true })).toBeNull();
    expect(key("j", { altKey: true })).toBeNull();
  });

  it("ignores other keys and works with no target", () => {
    expect(key("x")).toBeNull();
    expect(key("a", { target: null })).toEqual({ type: "approve" });
  });
});

describe("moveSelection", () => {
  it("moves and clamps", () => {
    expect(moveSelection(["a", "b"], null, 1)).toBe("a");
    expect(moveSelection(["a", "b"], null, -1)).toBe("b");
    expect(moveSelection(["a", "b"], "b", 1)).toBe("b");
    expect(moveSelection(["a", "b"], "a", -1)).toBe("a");
    expect(moveSelection(["a", "b", "c"], "b", 1)).toBe("c");
    expect(moveSelection([], null, 1)).toBeNull();
  });

  it("starts from the edge when the current id is gone", () => {
    expect(moveSelection(["a", "b"], "zzz", 1)).toBe("a");
    expect(moveSelection(["a", "b"], "zzz", -1)).toBe("b");
  });
});
