import { describe, expect, it, vi } from "vitest";
import { ATTACHMENTS_DIR, normalizeAttachmentPath, readAttachmentImage, sniffImageType } from "@/lib/media/attachments";

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
const GIF = new TextEncoder().encode("GIF89a....");
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

function sandboxReturning(bytes: Uint8Array | null | undefined) {
  const readBinaryFile = vi.fn().mockResolvedValue(bytes);
  return { readBinaryFile, ctx: { getSandbox: async () => ({ readBinaryFile }) } };
}

describe("normalizeAttachmentPath", () => {
  it("keeps a path under the attachments directory", () => {
    expect(normalizeAttachmentPath("/workspace/.eve/attachments/a/b.jpg")).toBe("/workspace/.eve/attachments/a/b.jpg");
  });

  it("collapses redundant segments", () => {
    expect(normalizeAttachmentPath("/workspace/.eve/attachments/a/./b.jpg")).toBe("/workspace/.eve/attachments/a/b.jpg");
  });

  it.each(["/workspace/.eve/attachments/../secret", "/etc/passwd", ATTACHMENTS_DIR, "/workspace/.eve/attachments"])(
    "refuses %s",
    (path) => {
      expect(normalizeAttachmentPath(path)).toBeNull();
    },
  );
});

describe("sniffImageType", () => {
  it("recognizes the image magic bytes", () => {
    expect(sniffImageType(PNG)).toBe("image/png");
    expect(sniffImageType(JPEG)).toBe("image/jpeg");
    expect(sniffImageType(GIF)).toBe("image/gif");
    expect(sniffImageType(WEBP)).toBe("image/webp");
  });

  it("returns null for anything else", () => {
    expect(sniffImageType(new TextEncoder().encode("hello"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("readAttachmentImage", () => {
  const path = "/workspace/.eve/attachments/a/b.jpg";

  it("reads an image and names its type from the bytes", async () => {
    const { ctx, readBinaryFile } = sandboxReturning(JPEG);
    expect(await readAttachmentImage(ctx, path)).toEqual({ ok: true, bytes: JPEG, mediaType: "image/jpeg" });
    expect(readBinaryFile).toHaveBeenCalledWith({ path, abortSignal: undefined });
  });

  it("says the photo is gone when the file is missing", async () => {
    const { ctx } = sandboxReturning(null);
    expect(await readAttachmentImage(ctx, path)).toEqual({
      ok: false,
      message: "That photo is no longer available. Send it again.",
    });
  });

  it("refuses bytes that are not an image", async () => {
    const { ctx } = sandboxReturning(new TextEncoder().encode("hello"));
    expect(await readAttachmentImage(ctx, path)).toEqual({ ok: false, message: "Only photos can be used." });
  });

  it("refuses a path outside the attachments directory without reading", async () => {
    const { ctx, readBinaryFile } = sandboxReturning(JPEG);
    expect(await readAttachmentImage(ctx, "/etc/passwd")).toEqual({ ok: false, message: "Only photos can be used." });
    expect(readBinaryFile).not.toHaveBeenCalled();
  });

  it("refuses a photo over the size limit", async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1);
    big.set(JPEG);
    const { ctx } = sandboxReturning(big);
    expect(await readAttachmentImage(ctx, path)).toEqual({ ok: false, message: "Images must be 20 MB or smaller." });
  });
});
