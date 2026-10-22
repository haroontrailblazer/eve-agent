import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Spinner } from "@/components/ui/spinner";

describe("Spinner", () => {
  it("spins, and stops spinning for people who ask for reduced motion", () => {
    const html = renderToStaticMarkup(createElement(Spinner));

    expect(html).toContain("animate-spin");
    expect(html).toContain("motion-reduce:animate-none");
  });

  it("keeps its status role and label", () => {
    const html = renderToStaticMarkup(createElement(Spinner));

    expect(html).toContain('role="status"');
    expect(html).toContain('aria-label="Loading"');
  });
});
