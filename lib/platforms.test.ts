import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { declaresToken, readThemeBlocks } from "@/lib/css-tokens";
import { PLATFORMS, SOCIAL_PLATFORMS, getPlatform } from "@/lib/platforms";

const blocks = readThemeBlocks(readFileSync(join(process.cwd(), "app", "globals.css"), "utf8"));

// "--status-review" -> "status-review", the form declaresToken takes.
function tokenName(colorToken: string): string {
  return colorToken.replace(/^--/, "");
}

describe("getPlatform", () => {
  it("finds a platform by its key", () => {
    expect(getPlatform("linkedin")?.label).toBe("LinkedIn");
    expect(getPlatform("deepwiki")?.label).toBe("DeepWiki");
  });

  it("matches keys exactly", () => {
    expect(getPlatform("LinkedIn")).toBeNull();
    expect(getPlatform("myspace")).toBeNull();
    expect(getPlatform("")).toBeNull();
  });

  it("does not read inherited object properties as platforms", () => {
    expect(getPlatform("constructor")).toBeNull();
    expect(getPlatform("toString")).toBeNull();
    expect(getPlatform("__proto__")).toBeNull();
  });
});

describe("PLATFORMS", () => {
  it("labels every platform", () => {
    expect(Object.fromEntries(Object.values(PLATFORMS).map((p) => [p.key, p.label]))).toEqual({
      x: "X",
      linkedin: "LinkedIn",
      threads: "Threads",
      whatsapp: "WhatsApp",
      slack: "Slack",
      notion: "Notion",
      linear: "Linear",
      sentry: "Sentry",
      deepwiki: "DeepWiki",
    });
  });

  it("keys each entry by its own key", () => {
    for (const [key, meta] of Object.entries(PLATFORMS)) {
      expect(meta.key).toBe(key);
    }
  });

  it("gives connections no color", () => {
    expect(PLATFORMS.notion.colorToken).toBeNull();
    expect(PLATFORMS.linear.colorToken).toBeNull();
    expect(PLATFORMS.sentry.colorToken).toBeNull();
    expect(PLATFORMS.deepwiki.colorToken).toBeNull();
  });

  it("colors social and channel platforms with --platform-<key>", () => {
    for (const meta of Object.values(PLATFORMS)) {
      if (meta.kind === "connection") continue;

      expect(meta.colorToken).toBe(`--platform-${meta.key}`);
    }
  });

  it("declares every platform color in the light and the dark block of app/globals.css", () => {
    for (const meta of Object.values(PLATFORMS)) {
      if (meta.colorToken === null) continue;

      expect(declaresToken(blocks.light, tokenName(meta.colorToken)), `${meta.key} light`).toBe(true);
      expect(declaresToken(blocks.dark, tokenName(meta.colorToken)), `${meta.key} dark`).toBe(true);
    }
  });

  it("maps every platform color to a Tailwind color in @theme inline", () => {
    for (const meta of Object.values(PLATFORMS)) {
      if (meta.colorToken === null) continue;

      expect(declaresToken(blocks.theme, `color-${tokenName(meta.colorToken)}`), meta.key).toBe(true);
    }
  });
});

describe("SOCIAL_PLATFORMS", () => {
  it("lists x, linkedin and threads in that order", () => {
    expect(SOCIAL_PLATFORMS.map((p) => p.key)).toEqual(["x", "linkedin", "threads"]);
  });

  it("holds exactly the social platforms", () => {
    expect(SOCIAL_PLATFORMS).toEqual(Object.values(PLATFORMS).filter((p) => p.kind === "social"));
  });
});
