import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGeneratedImage: vi.fn(),
  getMediaAsset: vi.fn(),
}));

vi.mock("@/lib/media/assets", () => ({ getMediaAsset: mocks.getMediaAsset }));
vi.mock("@/lib/db/images", () => ({ getGeneratedImage: mocks.getGeneratedImage }));

const { loadSourceImage } = await import("@/lib/media/load-source-image");
const { MAX_IMAGE_BYTES } = await import("@/lib/media/limits");

const U = "3f2b9c1e-1111-4222-8333-444455556666";
const BLOB_URL = "https://abc123.public.blob.vercel-storage.com/media/x.png";
const fetchMock = vi.fn<typeof fetch>();

function imageResponse(body: BodyInit | null, headers: Record<string, string> = {}, status = 200) {
  return new Response(body, { headers: { "content-type": "image/png", ...headers }, status });
}

beforeEach(() => {
  vi.stubEnv("BETTER_AUTH_URL", "https://harpy.example");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  mocks.getMediaAsset.mockReset().mockResolvedValue(null);
  mocks.getGeneratedImage.mockReset().mockResolvedValue(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadSourceImage from a Blob url", () => {
  it("fetches without following redirects and returns the bytes", async () => {
    fetchMock.mockResolvedValue(
      imageResponse(new Uint8Array([1, 2, 3]), { "content-type": "image/png; charset=binary" }),
    );

    const result = await loadSourceImage(BLOB_URL);

    expect(result).toEqual({
      image: { bytes: new Uint8Array([1, 2, 3]), mediaType: "image/png" },
      ok: true,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      new URL(BLOB_URL),
      expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) }),
    );
  });

  it("refuses a url that fails the source check without fetching it", async () => {
    const result = await loadSourceImage("http://169.254.169.254/latest/meta-data");

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a response that is not a supported image", async () => {
    fetchMock.mockResolvedValue(imageResponse("<html></html>", { "content-type": "text/html" }));

    expect((await loadSourceImage(BLOB_URL)).ok).toBe(false);
  });

  it("refuses an error status", async () => {
    fetchMock.mockResolvedValue(imageResponse(null, {}, 404));

    expect((await loadSourceImage(BLOB_URL)).ok).toBe(false);
  });

  it("refuses a declared length over the limit", async () => {
    fetchMock.mockResolvedValue(
      imageResponse(new Uint8Array([1]), { "content-length": String(MAX_IMAGE_BYTES + 1) }),
    );

    expect((await loadSourceImage(BLOB_URL)).ok).toBe(false);
  });

  it("stops reading a body that grows past the limit", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        sent += chunk.byteLength;
        controller.enqueue(chunk);

        if (sent > MAX_IMAGE_BYTES + chunk.byteLength * 4) {
          controller.close();
        }
      },
    });

    fetchMock.mockResolvedValue(imageResponse(body));

    const result = await loadSourceImage(BLOB_URL);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("20 MB");
    expect(sent).toBeLessThanOrEqual(MAX_IMAGE_BYTES + chunk.byteLength * 3);
  });

  it("reports a fetch that throws", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed: redirect"));

    const result = await loadSourceImage(BLOB_URL);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.message).toContain("fetch failed");
  });
});

describe("loadSourceImage from an app image url", () => {
  it("fetches the Blob url of a media asset", async () => {
    mocks.getMediaAsset.mockResolvedValue({ blobUrl: BLOB_URL, id: U });
    fetchMock.mockResolvedValue(imageResponse(new Uint8Array([4, 5])));

    const result = await loadSourceImage(`/api/images/${U}`);

    expect(mocks.getMediaAsset).toHaveBeenCalledWith(U);
    expect(fetchMock).toHaveBeenCalledWith(new URL(BLOB_URL), expect.anything());
    expect(result.ok && result.image.bytes).toEqual(new Uint8Array([4, 5]));
  });

  it("falls back to a legacy generated image", async () => {
    mocks.getGeneratedImage.mockResolvedValue({
      data: Buffer.from([7, 8, 9]).toString("base64"),
      id: U,
      mediaType: "image/jpeg",
    });

    const result = await loadSourceImage(`https://harpy.example/api/images/${U}`);

    expect(result).toEqual({
      image: { bytes: new Uint8Array([7, 8, 9]), mediaType: "image/jpeg" },
      ok: true,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a legacy image of an unsupported type", async () => {
    mocks.getGeneratedImage.mockResolvedValue({
      data: Buffer.from("<svg/>").toString("base64"),
      id: U,
      mediaType: "image/svg+xml",
    });

    expect((await loadSourceImage(`/api/images/${U}`)).ok).toBe(false);
  });

  it("reports an image that does not exist", async () => {
    const result = await loadSourceImage(`/api/images/${U}`);

    expect(result.ok).toBe(false);
  });
});
