import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Markdown } from "@/components/chat/markdown";

const BLOB_IMAGE_URL = "https://abc123.public.blob.vercel-storage.com/media/x.png";

describe("Markdown images", () => {
  it("renders an absolute public Blob image url", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, null, `![a red kite](${BLOB_IMAGE_URL})`),
    );

    expect(html).toContain(`src="${BLOB_IMAGE_URL}"`);
    expect(html).toContain('alt="a red kite"');
  });

  it("still renders a relative app image url", () => {
    const html = renderToStaticMarkup(
      createElement(Markdown, null, "![old](/api/images/3f2b9c1e-1111-4222-8333-444455556666)"),
    );

    expect(html).toContain('src="/api/images/3f2b9c1e-1111-4222-8333-444455556666"');
  });
});
