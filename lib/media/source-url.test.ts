import { describe, expect, it } from "vitest";
import { checkSourceImageUrl, isPublicBlobUrl, isUuid } from "@/lib/media/source-url";

const APP_ORIGIN = "https://harpy.example";
const U = "3f2b9c1e-1111-4222-8333-444455556666";
const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/media/x.png";

describe("checkSourceImageUrl", () => {
  it("accepts a public Blob url", () => {
    const result = checkSourceImageUrl(BLOB_URL, APP_ORIGIN);

    expect(result.ok).toBe(true);
    expect(result.ok && result.kind).toBe("blob");
    expect(result.ok && result.kind === "blob" ? result.url.href : null).toBe(BLOB_URL);
  });

  it("accepts a relative app image url", () => {
    expect(checkSourceImageUrl(`/api/images/${U}`, APP_ORIGIN)).toEqual({
      id: U,
      kind: "app-image",
      ok: true,
    });
  });

  it("accepts an absolute app image url on the app origin", () => {
    expect(checkSourceImageUrl(`${APP_ORIGIN}/api/images/${U}`, APP_ORIGIN)).toEqual({
      id: U,
      kind: "app-image",
      ok: true,
    });
  });

  it("trims the input before checking it", () => {
    expect(checkSourceImageUrl(`  /api/images/${U}\n`, APP_ORIGIN)).toEqual({
      id: U,
      kind: "app-image",
      ok: true,
    });
  });

  it.each([
    ["http Blob url", "http://abc.public.blob.vercel-storage.com/x"],
    ["Blob url with a port", "https://abc.public.blob.vercel-storage.com:8443/x"],
    ["Blob url with credentials", "https://u:p@abc.public.blob.vercel-storage.com/x"],
    ["private Blob store", "https://abc.private.blob.vercel-storage.com/x"],
    ["lookalike host", "https://public.blob.vercel-storage.com.evil.com/x"],
    ["cloud metadata address", "http://169.254.169.254/latest/meta-data"],
    ["another app route", `${APP_ORIGIN}/api/chats`],
    ["app image url with a query", `${APP_ORIGIN}/api/images/${U}?x=1`],
    ["protocol-relative url", "//evil.com/x.png"],
    ["data url", "data:image/png;base64,AAAA"],
    ["file url", "file:///etc/passwd"],
    ["empty string", ""],
    ["whitespace only", "   "],
    ["over 2048 characters", "a".repeat(2049)],
    ["app image url without a uuid", "/api/images/not-a-uuid"],
    ["app image url with a trailing slash", `/api/images/${U}/`],
    ["unparseable url", "https://"],
  ])("rejects a %s", (_label, input) => {
    const result = checkSourceImageUrl(input, APP_ORIGIN);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.reason.length).toBeGreaterThan(0);
  });
});

describe("isPublicBlobUrl", () => {
  it("accepts a public Blob url", () => {
    expect(isPublicBlobUrl(BLOB_URL)).toBe(true);
  });

  it.each([
    "http://abc.public.blob.vercel-storage.com/x",
    "https://abc.public.blob.vercel-storage.com:8443/x",
    "https://u:p@abc.public.blob.vercel-storage.com/x",
    "https://abc.private.blob.vercel-storage.com/x",
    "https://public.blob.vercel-storage.com.evil.com/x",
    `/api/images/${U}`,
    `https://harpy.example/api/images/${U}`,
    "",
    `https://abc.public.blob.vercel-storage.com/${"a".repeat(2048)}`,
  ])("rejects %j", (input) => {
    expect(isPublicBlobUrl(input)).toBe(false);
  });
});

describe("isUuid", () => {
  it("accepts a uuid", () => {
    expect(isUuid(U)).toBe(true);
  });

  it.each(["", "not-a-uuid", `${U}x`, `x${U}`, U.replaceAll("-", "")])("rejects %j", (input) => {
    expect(isUuid(input)).toBe(false);
  });
});
