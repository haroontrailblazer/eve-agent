import { describe, expect, it } from "vitest";
import { editTextToPlatformPosts, editTextToPosts, postsToEditText, postsToText } from "@/lib/drafts/thread-text";

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

describe("editTextToPlatformPosts", () => {
  it("keeps a --- divider inside a LinkedIn post", () => {
    expect(editTextToPlatformPosts("linkedin", "  Intro\n---\nMore  ")).toEqual(["Intro\n---\nMore"]);
  });

  it("splits X and Threads edits into thread parts", () => {
    expect(editTextToPlatformPosts("x", "one\n---\ntwo")).toEqual(["one", "two"]);
    expect(editTextToPlatformPosts("threads", "one\n---\ntwo")).toEqual(["one", "two"]);
  });

  it("gives no posts for a blank edit on any platform", () => {
    expect(editTextToPlatformPosts("linkedin", "  \n ")).toEqual([]);
    expect(editTextToPlatformPosts("x", "---")).toEqual([]);
  });
});
