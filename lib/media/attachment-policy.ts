import {
  FILE_TOO_LARGE_MESSAGE,
  IMAGE_TOO_LARGE_MESSAGE,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
  MAX_INLINE_ATTACHMENT_BYTES,
} from "@/lib/media/limits";

// How a chat attachment reaches the agent: supported images upload to Blob and
// travel as a url, everything else travels inline as a data url.
export type AttachmentRoute =
  | { readonly kind: "blob-image" }
  | { readonly kind: "inline" }
  | { readonly kind: "reject"; readonly message: string };

export function routeAttachment(file: { readonly type: string; readonly size: number }): AttachmentRoute {
  if (isAllowedImageType(file.type)) {
    return file.size <= MAX_IMAGE_BYTES
      ? { kind: "blob-image" }
      : { kind: "reject", message: IMAGE_TOO_LARGE_MESSAGE };
  }

  return file.size <= MAX_INLINE_ATTACHMENT_BYTES
    ? { kind: "inline" }
    : { kind: "reject", message: FILE_TOO_LARGE_MESSAGE };
}
