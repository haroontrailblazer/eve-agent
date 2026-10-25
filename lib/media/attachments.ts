import { posix } from "node:path";
import { IMAGE_TOO_LARGE_MESSAGE, MAX_IMAGE_BYTES, type AllowedImageType } from "@/lib/media/limits";

// Server only. eve stages inbound files in the sandbox under ATTACHMENTS_DIR
// and labels them "Attached file <path> (<type>)". These helpers turn such a
// path into checked image bytes; the label's type is never trusted.

export const ATTACHMENTS_DIR = "/workspace/.eve/attachments/";

const NOT_A_PHOTO_MESSAGE = "Only photos can be used.";
const PHOTO_GONE_MESSAGE = "That photo is no longer available. Send it again.";

// The normalized path when it names a file under ATTACHMENTS_DIR, else null.
export function normalizeAttachmentPath(path: string): string | null {
  const normalized = posix.normalize(path);
  return normalized.startsWith(ATTACHMENTS_DIR) && normalized !== ATTACHMENTS_DIR ? normalized : null;
}

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

// The image type named by the file's magic bytes, or null.
export function sniffImageType(bytes: Uint8Array): AllowedImageType | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export type SandboxReader = {
  readonly getSandbox: () => Promise<{
    readBinaryFile(args: { path: string; abortSignal?: AbortSignal }): PromiseLike<Uint8Array | null | undefined>;
  }>;
  readonly abortSignal?: AbortSignal;
};

export async function readAttachmentImage(
  ctx: SandboxReader,
  path: string,
): Promise<
  | { readonly ok: true; readonly bytes: Uint8Array; readonly mediaType: string }
  | { readonly ok: false; readonly message: string }
> {
  const file = normalizeAttachmentPath(path);
  if (!file) return { ok: false, message: NOT_A_PHOTO_MESSAGE };

  const sandbox = await ctx.getSandbox();
  const bytes = await sandbox.readBinaryFile({ path: file, abortSignal: ctx.abortSignal });
  if (!bytes) return { ok: false, message: PHOTO_GONE_MESSAGE };

  const mediaType = sniffImageType(bytes);
  if (!mediaType) return { ok: false, message: NOT_A_PHOTO_MESSAGE };
  if (bytes.byteLength > MAX_IMAGE_BYTES) return { ok: false, message: IMAGE_TOO_LARGE_MESSAGE };

  return { ok: true, bytes, mediaType };
}
