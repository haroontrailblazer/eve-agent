import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const values = vi.fn();

  return {
    del: vi.fn(),
    insert: vi.fn(() => ({ values })),
    put: vi.fn(),
    values,
  };
});

vi.mock("@vercel/blob", () => ({ del: mocks.del, put: mocks.put }));
vi.mock("@/lib/db/client", () => ({ db: { insert: mocks.insert } }));

const { recordUploadedMedia, saveMediaAsset } = await import("@/lib/media/assets");

const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/media/x.png";
const UPLOAD_URL = "https://abc123.public.blob.vercel-storage.com/uploads/kite-a1b2.png";
const MEDIA_PATH_RE = /^media\/[0-9a-f-]{36}\.png$/;

beforeEach(() => {
  mocks.del.mockReset().mockResolvedValue(undefined);
  mocks.put.mockReset().mockImplementation(async (pathname: string) => ({
    pathname,
    url: BLOB_URL,
  }));
  mocks.values.mockReset().mockResolvedValue(undefined);
});

describe("saveMediaAsset", () => {
  const input = {
    brandId: "brand-1",
    bytes: new Uint8Array([1, 2, 3]),
    mediaType: "image/png",
    prompt: "a red kite",
    source: "generated" as const,
    userId: "user-1",
  };

  it("puts the bytes on public Blob and records the row", async () => {
    const saved = await saveMediaAsset(input);

    expect(mocks.put).toHaveBeenCalledWith(expect.stringMatching(MEDIA_PATH_RE), expect.any(Buffer), {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: 31_536_000,
      contentType: "image/png",
    });
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        blobUrl: BLOB_URL,
        brandId: "brand-1",
        byteSize: 3,
        id: saved.id,
        mediaType: "image/png",
        prompt: "a red kite",
        source: "generated",
        userId: "user-1",
      }),
    );
    expect(mocks.put.mock.calls[0]?.[0]).toBe(`media/${saved.id}.png`);
    expect(saved.url).toBe(BLOB_URL);
  });

  it("refuses an image type Blob does not store, before uploading", async () => {
    await expect(saveMediaAsset({ ...input, mediaType: "image/svg+xml" })).rejects.toThrow(
      "Unsupported image type",
    );
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("deletes the Blob object and rethrows when the insert fails", async () => {
    mocks.values.mockRejectedValue(new Error("insert failed"));

    await expect(saveMediaAsset(input)).rejects.toThrow("insert failed");
    expect(mocks.del).toHaveBeenCalledWith(BLOB_URL);
  });

  it("rethrows the insert error even when the delete fails too", async () => {
    mocks.values.mockRejectedValue(new Error("insert failed"));
    mocks.del.mockRejectedValue(new Error("delete failed"));

    await expect(saveMediaAsset(input)).rejects.toThrow("insert failed");
  });
});

describe("recordUploadedMedia", () => {
  const upload = {
    brandId: "brand-1",
    contentType: "image/png",
    pathname: "uploads/kite-a1b2.png",
    size: 5_000_000,
    url: UPLOAD_URL,
    userId: "user-1",
  };

  it("records a valid upload", async () => {
    const recorded = await recordUploadedMedia(upload);

    expect(recorded.url).toBe(UPLOAD_URL);
    expect(mocks.values).toHaveBeenCalledWith(
      expect.objectContaining({
        blobPathname: "uploads/kite-a1b2.png",
        blobUrl: UPLOAD_URL,
        byteSize: 5_000_000,
        id: recorded.id,
        source: "uploaded",
      }),
    );
  });

  it.each([
    ["a url that is not public Blob", { url: "https://evil.example/uploads/x.png" }],
    ["a pathname outside uploads/", { pathname: "media/x.png" }],
    ["an unsupported content type", { contentType: "image/svg+xml" }],
    ["an image over 20 MB", { size: 21 * 1024 * 1024 }],
    ["a size that is not a whole number", { size: Number.NaN }],
  ])("rejects %s", async (_label, override) => {
    await expect(recordUploadedMedia({ ...upload, ...override })).rejects.toThrow();
    expect(mocks.values).not.toHaveBeenCalled();
  });
});
