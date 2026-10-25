import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { declaresToken, readThemeBlocks } from "@/lib/css-tokens";
import { DRAFT_STATUS_META, type DraftStatus } from "@/lib/draft-status";

const blocks = readThemeBlocks(readFileSync(join(process.cwd(), "app", "globals.css"), "utf8"));

// "--status-review" -> "status-review", the form declaresToken takes.
function tokenName(colorToken: string): string {
  return colorToken.replace(/^--/, "");
}

describe("DRAFT_STATUS_META", () => {
  it("describes needs_review", () => {
    expect(DRAFT_STATUS_META.needs_review).toEqual({
      label: "Needs review",
      colorToken: "--status-review",
      glyph: "half",
    });
  });

  it("labels, colors and draws every status", () => {
    const summary = Object.fromEntries(
      Object.entries(DRAFT_STATUS_META).map(([status, meta]) => [
        status,
        [meta.label, meta.colorToken, meta.glyph],
      ]),
    );

    expect(summary).toEqual({
      draft: ["Draft", "--status-draft", "dashed"],
      needs_review: ["Needs review", "--status-review", "half"],
      scheduled: ["Scheduled", "--status-scheduled", "clock"],
      posted: ["Posted", "--status-posted", "check"],
      failed: ["Failed", "--status-failed", "alert"],
      approved: ["Approved", "--status-scheduled", "dot"],
      skipped: ["Skipped", "--status-draft", "slash"],
    });
  });

  it("gives each status its own glyph", () => {
    const glyphs = (Object.keys(DRAFT_STATUS_META) as DraftStatus[]).map(
      (status) => DRAFT_STATUS_META[status].glyph,
    );

    expect(new Set(glyphs).size).toBe(glyphs.length);
  });

  it.each(Object.entries(DRAFT_STATUS_META))(
    "declares the %s color in the light and the dark block of app/globals.css",
    (_status, meta) => {
      expect(declaresToken(blocks.light, tokenName(meta.colorToken))).toBe(true);
      expect(declaresToken(blocks.dark, tokenName(meta.colorToken))).toBe(true);
    },
  );

  it.each(Object.entries(DRAFT_STATUS_META))(
    "maps the %s color to a Tailwind color in @theme inline",
    (_status, meta) => {
      expect(declaresToken(blocks.theme, `color-${tokenName(meta.colorToken)}`)).toBe(true);
    },
  );
});
