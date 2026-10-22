import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { declaresToken, readThemeBlocks } from "@/lib/css-tokens";

const globalsCss = readFileSync(join(process.cwd(), "app", "globals.css"), "utf8");
const blocks = readThemeBlocks(globalsCss);

const SHARED_TOKENS = [
  "status-draft",
  "status-review",
  "status-scheduled",
  "status-posted",
  "status-failed",
  "platform-x",
  "platform-linkedin",
  "platform-threads",
  "platform-whatsapp",
  "platform-slack",
  "overlay",
  "sidebar",
  "sidebar-foreground",
  "sidebar-border",
  "raised-shadow",
  "wordmark-gradient",
] as const;

describe("app/globals.css design tokens", () => {
  it.each(SHARED_TOKENS)("declares --%s in the light and the dark block", (name) => {
    expect(declaresToken(blocks.light, name)).toBe(true);
    expect(declaresToken(blocks.dark, name)).toBe(true);
  });

  it("maps tokens to Tailwind in @theme inline", () => {
    expect(blocks.theme).toContain("--color-status-review: var(--status-review)");
    expect(blocks.theme).toContain("--font-sans: var(--font-geist-sans)");
    expect(blocks.theme).toContain("--text-body:");
  });

  it("imports tw-animate-css and layers the base rules", () => {
    expect(globalsCss).toContain('@import "tw-animate-css";');
    expect(globalsCss).toContain("@layer base");
  });
});

describe("readThemeBlocks", () => {
  const css = `
    @source "../node_modules/streamdown/dist/*.js";
    @custom-variant dark (&:where(.dark, .dark *));
    @theme inline { --color-a: var(--a); --text-body: 1rem; }
    /* --ignored: 1; */
    :root,
    .light { --a: 1; --sidebar: 2; --sidebar-foreground: 3; }
    .dark { --a: 4; }
  `;

  it("splits the light, dark and theme blocks", () => {
    const parsed = readThemeBlocks(css);

    expect(declaresToken(parsed.light, "a")).toBe(true);
    expect(declaresToken(parsed.dark, "a")).toBe(true);
    expect(declaresToken(parsed.dark, "sidebar")).toBe(false);
    expect(parsed.theme).toContain("--text-body: 1rem");
  });

  it("does not take a longer name or a prefixed name for the token", () => {
    const parsed = readThemeBlocks(css);

    expect(declaresToken(parsed.light, "sidebar")).toBe(true);
    expect(declaresToken(parsed.light, "side")).toBe(false);
    expect(declaresToken(parsed.theme, "a")).toBe(false);
    expect(declaresToken(parsed.theme, "color-a")).toBe(true);
  });

  it("ignores comments", () => {
    expect(declaresToken(readThemeBlocks(css).light, "ignored")).toBe(false);
  });

  it("returns empty blocks when a block is missing", () => {
    expect(readThemeBlocks("body { color: red; }")).toEqual({ light: "", dark: "", theme: "" });
  });
});
