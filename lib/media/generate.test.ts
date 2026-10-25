import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class RateLimitError extends Error {
    readonly retryAfter = 60;
  }

  return {
    RateLimitError,
    enforceRateLimit: vi.fn(),
    generateOrEditImage: vi.fn(),
    saveMediaAsset: vi.fn(),
  };
});

vi.mock("@/lib/rate-limit", () => ({
  RateLimitError: mocks.RateLimitError,
  enforceRateLimit: mocks.enforceRateLimit,
}));
vi.mock("@/lib/image-gen", () => ({ generateOrEditImage: mocks.generateOrEditImage }));
vi.mock("@/lib/media/assets", () => ({ saveMediaAsset: mocks.saveMediaAsset }));

const { generateBrandImage } = await import("@/lib/media/generate");

const input = { brandId: "brand-1", userId: "user-1", prompt: "a red kite" };

beforeEach(() => {
  mocks.enforceRateLimit.mockReset().mockResolvedValue(undefined);
  mocks.generateOrEditImage.mockReset().mockResolvedValue({ base64: "AQID", mediaType: "image/png" });
  mocks.saveMediaAsset.mockReset().mockResolvedValue({ id: "media-1", url: "https://blob.example/media-1.png" });
});

describe("generateBrandImage", () => {
  it("returns the saved media id and url", async () => {
    expect(await generateBrandImage(input)).toEqual({ ok: true, mediaId: "media-1", url: "https://blob.example/media-1.png" });
    expect(mocks.enforceRateLimit).toHaveBeenCalledWith({
      key: "brand-1",
      limit: 50,
      prefix: "image:generate",
      windowSeconds: 86_400,
    });
    expect(mocks.generateOrEditImage).toHaveBeenCalledWith({ prompt: "a red kite", sourceImage: undefined });
    expect(mocks.saveMediaAsset).toHaveBeenCalledWith({
      brandId: "brand-1",
      bytes: Buffer.from([1, 2, 3]),
      mediaType: "image/png",
      prompt: "a red kite",
      source: "generated",
      userId: "user-1",
    });
  });

  it("passes a source image through for edits", async () => {
    const sourceImage = { bytes: new Uint8Array([9]), mediaType: "image/jpeg" };
    await generateBrandImage({ ...input, sourceImage });
    expect(mocks.generateOrEditImage).toHaveBeenCalledWith({ prompt: "a red kite", sourceImage });
  });

  it("stops at the daily image limit", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new mocks.RateLimitError("Too many requests."));
    const result = await generateBrandImage(input);
    expect(result).toEqual({ ok: false, message: "Image limit reached for today (50). Try again tomorrow." });
    expect(result.ok || result.message).toContain("Image limit reached for today (50)");
    expect(mocks.generateOrEditImage).not.toHaveBeenCalled();
  });

  it("reports a limit check that could not run", async () => {
    mocks.enforceRateLimit.mockRejectedValue(new Error("redis down"));
    expect(await generateBrandImage(input)).toEqual({ ok: false, message: "Couldn't check the image limit: redis down" });
  });

  it("reports a failed generation", async () => {
    mocks.generateOrEditImage.mockRejectedValue(new Error("refused"));
    expect(await generateBrandImage(input)).toEqual({
      ok: false,
      message: "Image generation failed: refused. Make sure the AI Gateway has Google Gemini image models enabled.",
    });
    expect(mocks.saveMediaAsset).not.toHaveBeenCalled();
  });

  it("reports an image it made but could not save", async () => {
    mocks.saveMediaAsset.mockRejectedValue(new Error("blob down"));
    expect(await generateBrandImage(input)).toEqual({
      ok: false,
      message: "Generated the image but couldn't save it: blob down",
    });
  });
});
