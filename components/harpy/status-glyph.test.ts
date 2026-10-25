import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusGlyph } from "@/components/harpy/status-glyph";

function render(status: Parameters<typeof StatusGlyph>[0]["status"]) {
  return renderToStaticMarkup(createElement(StatusGlyph, { status }));
}

describe("StatusGlyph", () => {
  it("draws approved as a circle with a filled dot in the scheduled color", () => {
    const html = render("approved");
    expect(html).toContain('<circle cx="6" cy="6" r="4.5"');
    expect(html).toContain('<circle cx="6" cy="6" r="1.75" fill="currentColor" stroke="none">');
    expect(html).toContain("text-status-scheduled");
  });

  it("draws skipped as a circle with a slash in the draft color", () => {
    const html = render("skipped");
    expect(html).toContain('<circle cx="6" cy="6" r="4.5"');
    expect(html).toContain('<path d="M3.5 8.5l5-5">');
    expect(html).toContain("text-status-draft");
  });
});
