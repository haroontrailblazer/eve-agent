import { describe, expect, it } from "vitest";
import { APP_NAV, isChatPath, isNavItemActive } from "@/lib/nav";

describe("APP_NAV", () => {
  it("lists the app sections in sidebar order", () => {
    expect(APP_NAV.map((item) => item.label)).toEqual([
      "Studio",
      "Calendar",
      "Inbox",
      "Brief",
      "Brand voice",
      "Channels",
      "Chat",
      "Settings",
    ]);
  });

  it("gives each section its route", () => {
    expect(APP_NAV.map((item) => item.href)).toEqual([
      "/",
      "/calendar",
      "/inbox",
      "/brief",
      "/brand-voice",
      "/channels",
      "/chat",
      "/settings",
    ]);
  });
});

describe("isNavItemActive", () => {
  it.each([
    ["/", "/", true],
    ["/", "/chat", false],
    ["/chat", "/chat", true],
    ["/chat", "/chat/abc", true],
    ["/chat", "/chatter", false],
    ["/brand-voice", "/brand-voice", true],
    ["/brand-voice", "/brand", false],
    ["/settings", "/", false],
  ])("isNavItemActive(%j, %j) is %j", (href, pathname, expected) => {
    expect(isNavItemActive(href, pathname)).toBe(expected);
  });

  it("marks exactly one section active on every section route", () => {
    for (const item of APP_NAV) {
      const active = APP_NAV.filter((other) => isNavItemActive(other.href, item.href));
      expect(active.map((other) => other.href), item.href).toEqual([item.href]);
    }
  });
});

describe("isChatPath", () => {
  it("is true for the chat home and a chat", () => {
    expect(isChatPath("/chat")).toBe(true);
    expect(isChatPath("/chat/x")).toBe(true);
  });

  it("is false elsewhere", () => {
    expect(isChatPath("/channels")).toBe(false);
    expect(isChatPath("/chatter")).toBe(false);
    expect(isChatPath("/")).toBe(false);
  });
});
