// Size and type limits for images and attachments. Shared by the composer, the
// chat send path, the upload route and the server-side loaders, so the browser
// and the server always agree.

// Image types harpy stores on Blob, and the file extension each one gets.
export const ALLOWED_IMAGE_TYPES: Readonly<
  Record<"image/png" | "image/jpeg" | "image/webp" | "image/gif", "png" | "jpg" | "webp" | "gif">
> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type AllowedImageType = keyof typeof ALLOWED_IMAGE_TYPES;

export const MAX_IMAGE_BYTES = 20 * 1024 * 1024;

// Files that are not Blob images travel inline as base64 in the chat request.
// Vercel request bodies cap at 4.5 MB of base64.
export const MAX_INLINE_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export const IMAGE_GENERATIONS_PER_DAY = 50;

const MEGABYTE = 1024 * 1024;

export const IMAGE_TOO_LARGE_MESSAGE = `Images must be ${MAX_IMAGE_BYTES / MEGABYTE} MB or smaller.`;
export const FILE_TOO_LARGE_MESSAGE = `Files other than images must be ${MAX_INLINE_ATTACHMENT_BYTES / MEGABYTE} MB or smaller.`;

export function isAllowedImageType(type: string): type is AllowedImageType {
  return Object.hasOwn(ALLOWED_IMAGE_TYPES, type);
}
