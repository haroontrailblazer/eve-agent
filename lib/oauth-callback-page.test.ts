import { describe, expect, it } from "vitest";
import { BRAND_IMAGE_COLORS } from "@/lib/brand";
import { renderCallbackPage } from "@/lib/oauth-callback-page";

describe("renderCallbackPage", () => {
  it("escapes title and body", async () => {
    const res = renderCallbackPage({ title: "<b>", body: "<script>alert(1)</script>", ok: false });
    const text = await res.text();

    expect(text).toContain("&lt;script&gt;");
    expect(text).toContain("&lt;b&gt;");
    expect(text).not.toContain("<script>alert");
    expect(text).not.toContain("<b>");
  });

  it("sets locked-down security headers", () => {
    const res = renderCallbackPage({ title: "t", body: "b", ok: true });

    expect(res.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(res.headers.get("content-security-policy")).toBe(
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    );
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("shows a check mark on success and a warning on failure", async () => {
    const good = await renderCallbackPage({ title: "t", body: "b", ok: true }).text();
    const bad = await renderCallbackPage({ title: "t", body: "b", ok: false }).text();

    expect(good).toContain("✓");
    expect(bad).toContain("⚠");
  });

  it("takes its colors from the brand image colors", async () => {
    const text = await renderCallbackPage({ title: "t", body: "b", ok: true }).text();

    expect(text).toContain(`background:${BRAND_IMAGE_COLORS.callbackBackground}`);
    expect(text).toContain(`color:${BRAND_IMAGE_COLORS.callbackText}`);
    expect(text).toContain(`color:${BRAND_IMAGE_COLORS.callbackMuted}`);
  });

  it("uses no inline scripts or event handlers", async () => {
    const text = await renderCallbackPage({ title: "t", body: "b", ok: true }).text();

    expect(text).not.toMatch(/<script/i);
    expect(text).not.toMatch(/\son\w+=/i);
  });
});
