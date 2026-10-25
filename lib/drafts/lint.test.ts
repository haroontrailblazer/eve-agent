import { describe, expect, it } from "vitest";
import { countPostChars, hasLintErrors, lintPost, lintText } from "@/lib/drafts/lint";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("countPostChars", () => {
  it("counts an X url as 23", () => expect(countPostChars("x", "see https://example.com/a/very/long/path/indeed")).toBe(4 + 23));
  it("counts emoji as one code point", () => expect(countPostChars("threads", "hi 👋")).toBe(4));
});

describe("lintPost", () => {
  it("passes a clean X post", () => expect(lintPost({ platform: "x", posts: ["Shipping beats planning."], allowLinks: false })).toEqual([]));
  it("flags an X post over 280", () => expect(codes(lintPost({ platform: "x", posts: ["a".repeat(281)], allowLinks: false }))).toEqual(["too_long"]));
  it("checks each thread part and numbers it", () => {
    const issues = lintPost({ platform: "x", posts: ["ok", "b".repeat(300)], allowLinks: false });
    expect(issues).toMatchObject([{ code: "too_long", part: 2, severity: "error" }]);
    expect(issues[0].message).toBe("Post 2: X posts can be 280 characters. This one has 300.");
  });
  it("words the too_long message with the limit and the count", () => {
    const [issue] = lintPost({ platform: "x", posts: ["a".repeat(300)], allowLinks: false });
    expect(issue.message).toBe("X posts can be 280 characters. This one has 300.");
    expect(issue.part).toBeUndefined();
  });
  it("flags a Threads post over 500 but not one of 500", () => {
    expect(codes(lintPost({ platform: "threads", posts: ["c".repeat(501)], allowLinks: true }))).toEqual(["too_long"]);
    expect(lintPost({ platform: "threads", posts: ["c".repeat(500)], allowLinks: true })).toEqual([]);
  });
  it("flags LinkedIn over 3000 and more than one part", () => {
    expect(codes(lintPost({ platform: "linkedin", posts: ["d".repeat(3001)], allowLinks: true }))).toEqual(["too_long"]);
    expect(codes(lintPost({ platform: "linkedin", posts: ["a", "b"], allowLinks: true }))).toEqual(["too_many_parts"]);
  });
  it("flags links on X unless allowed", () => {
    expect(codes(lintPost({ platform: "x", posts: ["read https://a.co"], allowLinks: false }))).toEqual(["link_on_x"]);
    expect(lintPost({ platform: "x", posts: ["read https://a.co"], allowLinks: true })).toEqual([]);
  });
  it("flags banned phrases, em dashes and blank posts", () => {
    expect(codes(lintPost({ platform: "linkedin", posts: ["Let's delve into it — fast."], allowLinks: true }))).toEqual(["banned_phrase", "em_dash"]);
    expect(codes(lintPost({ platform: "x", posts: ["  "], allowLinks: false }))).toEqual(["empty"]);
    expect(codes(lintPost({ platform: "x", posts: [], allowLinks: false }))).toEqual(["empty"]);
  });
  it("flags more than 10 X posts", () => {
    const posts = Array.from({ length: 11 }, () => "ok");
    expect(codes(lintPost({ platform: "x", posts, allowLinks: false }))).toEqual(["too_many_parts"]);
  });
  it("warns, without erroring, on too many hashtags", () => {
    const issues = lintPost({ platform: "threads", posts: ["#one #two"], allowLinks: true });
    expect(issues).toMatchObject([{ code: "too_many_hashtags", severity: "warning" }]);
    expect(hasLintErrors(issues)).toBe(false);
  });
  it("errors on a second cashtag on X", () => expect(codes(lintPost({ platform: "x", posts: ["$AAPL vs $MSFT"], allowLinks: false }))).toEqual(["too_many_cashtags"]));
  it("flags more than 5 links in one Threads post", () => {
    const post = Array.from({ length: 6 }, (_, i) => `https://a.co/${i}`).join(" ");
    expect(codes(lintPost({ platform: "threads", posts: [post], allowLinks: true }))).toEqual(["too_many_links"]);
  });
});

describe("lintText", () => {
  it("checks only phrases and dashes", () => expect(codes(lintText("A tapestry — of ideas"))).toEqual(["banned_phrase", "em_dash"]));
});
