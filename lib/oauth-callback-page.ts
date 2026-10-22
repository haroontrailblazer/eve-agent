import { BRAND_IMAGE_COLORS } from "@/lib/brand";
import { escapeHtml } from "@/lib/html";

// Everything interpolated into the page is escaped here, so callers can pass
// raw strings (query params, platform names, error messages). The CSP forbids
// scripts, images, frames and forms; only inline styles are allowed.
export function renderCallbackPage(input: {
  readonly title: string;
  readonly body: string;
  readonly ok: boolean;
}): Response {
  const title = escapeHtml(input.title);
  const body = escapeHtml(input.body);
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:${BRAND_IMAGE_COLORS.callbackBackground};color:${BRAND_IMAGE_COLORS.callbackText};font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"><div style="max-width:26rem;padding:2rem;text-align:center"><div style="font-size:2.2rem;line-height:1;margin-bottom:1rem">${input.ok ? "✓" : "⚠"}</div><h1 style="font-size:1.15rem;margin:0 0 .5rem">${title}</h1><p style="color:${BRAND_IMAGE_COLORS.callbackMuted};font-size:.9rem;line-height:1.55;margin:0">${body}</p></div></body></html>`;

  return new Response(html, {
    headers: {
      "cache-control": "no-store",
      "content-security-policy":
        "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
      "content-type": "text/html; charset=utf-8",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
}
