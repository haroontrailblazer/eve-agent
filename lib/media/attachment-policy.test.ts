import { describe, expect, it } from "vitest";
import { routeAttachment } from "@/lib/media/attachment-policy";

describe("routeAttachment", () => {
  it("sends a supported image to Blob", () => {
    expect(routeAttachment({ size: 5_000_000, type: "image/png" })).toEqual({
      kind: "blob-image",
    });
  });

  it("sends an image of exactly 20 MB to Blob", () => {
    expect(routeAttachment({ size: 20 * 1024 * 1024, type: "image/jpeg" })).toEqual({
      kind: "blob-image",
    });
  });

  it("rejects an image over 20 MB", () => {
    expect(routeAttachment({ size: 21 * 1024 * 1024, type: "image/png" })).toEqual({
      kind: "reject",
      message: "Images must be 20 MB or smaller.",
    });
  });

  it("inlines a small file that is not an image", () => {
    expect(routeAttachment({ size: 2_000_000, type: "application/pdf" })).toEqual({
      kind: "inline",
    });
  });

  it("rejects a file that is not an image over 3 MB", () => {
    expect(routeAttachment({ size: 4 * 1024 * 1024, type: "application/pdf" })).toEqual({
      kind: "reject",
      message: "Files other than images must be 3 MB or smaller.",
    });
  });

  it("inlines an image type that Blob does not accept", () => {
    expect(routeAttachment({ size: 1000, type: "image/svg+xml" })).toEqual({ kind: "inline" });
  });
});
