import { describe, expect, it } from "vitest";
import { editTextToPosts, postsToEditText, postsToText } from "@/lib/drafts/thread-text";

describe("thread text", () => {
  it("round trips posts through edit text", () => {
    expect(editTextToPosts(postsToEditText(["a", "b"]))).toEqual(["a", "b"]);
  });

  it("drops empty posts between separators", () => {
    expect(editTextToPosts("one\n---\n\n---\ntwo")).toEqual(["one", "two"]);
  });

  it("joins posts with a blank line for display", () => {
    expect(postsToText(["a", "b"])).toBe("a\n\nb");
  });

  it("keeps a dash inside a line", () => {
    expect(editTextToPosts("a --- b")).toEqual(["a --- b"]);
  });
});
