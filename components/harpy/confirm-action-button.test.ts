import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmActionButton } from "@/components/harpy/confirm-action-button";

function render(overrides: Partial<Parameters<typeof ConfirmActionButton>[0]> = {}) {
  return renderToStaticMarkup(
    createElement(ConfirmActionButton, {
      confirmBody: "This removes the chat for good.",
      confirmLabel: "Delete chat",
      confirmTitle: "Delete this chat?",
      label: "Delete",
      onConfirm: vi.fn(async () => {}),
      pendingLabel: "Deleting...",
      ...overrides,
    }),
  );
}

describe("ConfirmActionButton", () => {
  it("shows only its trigger until it is opened", () => {
    const html = render();

    expect(html).toContain("Delete");
    expect(html).toMatch(/<button[^>]*type="button"/);
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("Delete this chat?");
    expect(html).not.toContain("Deleting...");
  });

  it("is a destructive button unless told otherwise", () => {
    expect(render()).toContain('data-variant="destructive"');
    expect(render({ variant: "outline" })).toContain('data-variant="outline"');
  });
});
