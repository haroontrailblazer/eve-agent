import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BRAND_IMAGE_COLORS } from "@/lib/brand";

function tileStopColors(svg: string): string[] {
  const tile = /<linearGradient\s+id="tile"[^>]*>([\s\S]*?)<\/linearGradient>/.exec(svg);
  if (!tile?.[1]) throw new Error("icon.svg has no tile gradient");
  return [...tile[1].matchAll(/stop-color="([^"]+)"/g)].map((match) => match[1] ?? "");
}

describe("BRAND_IMAGE_COLORS", () => {
  it("keeps the tile stops in step with app/icon.svg", () => {
    const svg = readFileSync(join(process.cwd(), "app", "icon.svg"), "utf8");

    expect(tileStopColors(svg)).toEqual([...BRAND_IMAGE_COLORS.tile]);
  });
});
