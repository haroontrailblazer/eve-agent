import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DraftCard } from "@/components/harpy/draft-card";

function render(overrides: Partial<Parameters<typeof DraftCard>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(DraftCard, {
      meta: "X · 24 chars",
      platform: "x",
      status: "needs_review",
      text: "Shipping beats polishing.",
      ...overrides,
    }),
  );
}

describe("DraftCard", () => {
  it("shows warnings and a notice", () => {
    const html = render({
      warnings: ["X posts can be 280 characters."],
      notice: "Approved. It waits here until publishing is set up.",
    });
    expect(html).toContain("X posts can be 280 characters.");
    expect(html).toContain("Approved. It waits here");
  });

  it("renders Restore only with onRestore", () => {
    expect(render({ onRestore: vi.fn() })).toContain(">Restore<");
    expect(render()).not.toContain(">Restore<");
  });

  it("replaces the text with children while editing", () => {
    const html = render({ text: "original", children: createElement("textarea", { defaultValue: "editing" }) });
    expect(html).not.toContain("original");
    expect(html).toContain("editing");
  });

  it("replaces the image with children while editing", () => {
    const html = render({
      imageUrl: "https://blob.example/draft.png",
      children: createElement("textarea", { defaultValue: "editing" }),
    });
    expect(html).not.toContain("https://blob.example/draft.png");
  });

  it("draws the new statuses", () => {
    expect(render({ status: "approved" })).toContain("Approved");
    expect(render({ status: "skipped" })).toContain("Skipped");
  });

  it("says harpy is refining while it works, unless told otherwise", () => {
    expect(render({ isWorking: true })).toContain("harpy is refining");
    expect(render({ isWorking: true, workingLabel: "harpy is redrafting" })).toContain("harpy is redrafting");
    expect(render()).not.toContain("harpy is refining");
  });

  it("disables its actions while one runs", () => {
    const actions = { onApprove: vi.fn(), onEdit: vi.fn(), onSkip: vi.fn() };
    expect(render({ ...actions, isBusy: true }).match(/<button[^>]*disabled=""/g)).toHaveLength(3);
    expect(render(actions)).not.toContain('disabled=""');
  });

  it("marks the selected card", () => {
    const html = render({ isSelected: true });
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('data-selected="true"');
    expect(render()).not.toContain("aria-current");
  });
});
