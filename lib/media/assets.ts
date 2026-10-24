import { randomUUID } from "node:crypto";
import { del, put } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mediaAsset, type MediaAsset } from "@/lib/db/schema";
import {
  ALLOWED_IMAGE_TYPES,
  IMAGE_TOO_LARGE_MESSAGE,
  isAllowedImageType,
  MAX_IMAGE_BYTES,
} from "@/lib/media/limits";
import { isPublicBlobUrl } from "@/lib/media/source-url";

// Server only. Media bytes live on public Vercel Blob (BLOB_READ_WRITE_TOKEN);
// each media_asset row records which brand owns a Blob object.

export type MediaSource = "generated" | "uploaded" | "whatsapp";

const ONE_YEAR_SECONDS = 31_536_000;

// Uploads the bytes to media/<id>.<ext> on Blob, then records the row. If the
// row cannot be written, the Blob object is deleted so nothing is orphaned.
export async function saveMediaAsset(input: {
  readonly brandId: string;
  readonly userId: string | null;
  readonly bytes: Uint8Array;
  readonly mediaType: string;
  readonly source: MediaSource;
  readonly prompt?: string;
}): Promise<{ readonly id: string; readonly url: string }> {
  if (!isAllowedImageType(input.mediaType)) {
    throw new Error(`Unsupported image type: ${input.mediaType}.`);
  }

  const id = randomUUID();
  const blob = await put(
    `media/${id}.${ALLOWED_IMAGE_TYPES[input.mediaType]}`,
    Buffer.from(input.bytes),
    {
      access: "public",
      addRandomSuffix: false,
      cacheControlMaxAge: ONE_YEAR_SECONDS,
      contentType: input.mediaType,
    },
  );

  try {
    await db.insert(mediaAsset).values({
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      brandId: input.brandId,
      byteSize: input.bytes.byteLength,
      id,
      mediaType: input.mediaType,
      prompt: input.prompt ?? "",
      source: input.source,
      userId: input.userId,
    });
  } catch (error) {
    try {
      await del(blob.url);
    } catch {
      // The insert error is the one worth reporting.
    }

    throw error;
  }

  return { id, url: blob.url };
}

// Records an image the browser uploaded straight to Blob (see
// app/api/media/upload). The browser reports the upload, so every field is
// checked before it is stored.
export async function recordUploadedMedia(input: {
  readonly brandId: string;
  readonly userId: string;
  readonly url: string;
  readonly pathname: string;
  readonly contentType: string;
  readonly size: number;
}): Promise<{ readonly id: string; readonly url: string }> {
  if (!isPublicBlobUrl(input.url)) {
    throw new Error("Uploads must be public Vercel Blob urls.");
  }

  if (!input.pathname.startsWith("uploads/")) {
    throw new Error("Uploads must be stored under uploads/.");
  }

  if (!isAllowedImageType(input.contentType)) {
    throw new Error(`Unsupported image type: ${input.contentType}.`);
  }

  if (!Number.isInteger(input.size) || input.size < 0 || input.size > MAX_IMAGE_BYTES) {
    throw new Error(IMAGE_TOO_LARGE_MESSAGE);
  }

  const id = randomUUID();

  await db.insert(mediaAsset).values({
    blobPathname: input.pathname,
    blobUrl: input.url,
    brandId: input.brandId,
    byteSize: input.size,
    id,
    mediaType: input.contentType,
    source: "uploaded",
    userId: input.userId,
  });

  return { id, url: input.url };
}

export async function getMediaAsset(id: string): Promise<MediaAsset | null> {
  const rows = await db.select().from(mediaAsset).where(eq(mediaAsset.id, id)).limit(1);

  return rows[0] ?? null;
}
