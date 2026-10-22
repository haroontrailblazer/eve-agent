import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConnectionSwitch } from "@/components/chat/integrations-menu";

describe("ConnectionSwitch", () => {
  it("is a visual-only child: hidden from assistive tech, out of the tab order, not clickable", () => {
    const html = renderToStaticMarkup(createElement(ConnectionSwitch, { enabled: true }));

    expect(html).toContain('data-slot="switch"');
    expect(html).toContain('data-size="sm"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain("pointer-events-none");
  });

  it("shows whether the connection is on", () => {
    expect(renderToStaticMarkup(createElement(ConnectionSwitch, { enabled: true }))).toContain(
      'data-state="checked"',
    );
    expect(renderToStaticMarkup(createElement(ConnectionSwitch, { enabled: false }))).toContain(
      'data-state="unchecked"',
    );
  });
});
