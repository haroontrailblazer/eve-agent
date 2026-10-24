import { getGeneratedImage } from "@/lib/db/images";
import type { SourceImage } from "@/lib/image-gen";
import { getMediaAsset } from "@/lib/media/assets";
import { IMAGE_TOO_LARGE_MESSAGE, isAllowedImageType, MAX_IMAGE_BYTES } from "@/lib/media/limits";
import { checkSourceImageUrl, isPublicBlobUrl } from "@/lib/media/source-url";

// Server only. Loads the image generate_image should edit. Only urls that pass
// checkSourceImageUrl are read, redirects are refused, and the size limit is
// enforced while the body streams in, so a hostile url cannot reach internal
// addresses or exhaust memory.

type LoadResult =
  | { readonly ok: true; readonly image: SourceImage }
  | { readonly ok: false; readonly message: string };

const FETCH_TIMEOUT_MS = 15_000;

export async function loadSourceImage(raw: string): Promise<LoadResult> {
  const check = checkSourceImageUrl(raw);

  if (!check.ok) {
    return fail(check.reason);
  }

  if (check.kind === "blob") {
    return fetchImage(check.url);
  }

  const asset = await getMediaAsset(check.id);

  if (asset) {
    return isPublicBlobUrl(asset.blobUrl)
      ? fetchImage(new URL(asset.blobUrl))
      : fail("That image is not stored on public Vercel Blob.");
  }

  // Images saved before media moved to Blob are base64 rows.
  const legacy = await getGeneratedImage(check.id);

  if (!legacy) {
    return fail("That image no longer exists.");
  }

  if (!isAllowedImageType(legacy.mediaType)) {
    return fail(unsupportedTypeMessage(legacy.mediaType));
  }

  const bytes = new Uint8Array(Buffer.from(legacy.data, "base64"));

  return bytes.byteLength > MAX_IMAGE_BYTES
    ? fail(IMAGE_TOO_LARGE_MESSAGE)
    : { image: { bytes, mediaType: legacy.mediaType }, ok: true };
}

async function fetchImage(url: URL): Promise<LoadResult> {
  try {
    const response = await fetch(url, {
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) {
      await response.body?.cancel();

      return fail(`The image url returned ${response.status}.`);
    }

    const mediaType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";

    if (!isAllowedImageType(mediaType)) {
      await response.body?.cancel();

      return fail(unsupportedTypeMessage(mediaType || "unknown"));
    }

    const declaredLength = Number(response.headers.get("content-length") ?? "");

    if (Number.isFinite(declaredLength) && declaredLength > MAX_IMAGE_BYTES) {
      await response.body?.cancel();

      return fail(IMAGE_TOO_LARGE_MESSAGE);
    }

    const bytes = await readWithLimit(response, MAX_IMAGE_BYTES);

    return bytes ? { image: { bytes, mediaType }, ok: true } : fail(IMAGE_TOO_LARGE_MESSAGE);
  } catch (error) {
    return fail(`Couldn't load the image: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// The body's bytes, or null once it grows past maxBytes (reading stops there).
async function readWithLimit(response: Response, maxBytes: number): Promise<Uint8Array | null> {
  if (!response.body) {
    return new Uint8Array();
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (;;) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    total += value.byteLength;

    if (total > maxBytes) {
      await reader.cancel();

      return null;
    }

    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return bytes;
}

function unsupportedTypeMessage(mediaType: string) {
  return `That file is ${mediaType}, not a PNG, JPEG, WebP or GIF image.`;
}

function fail(message: string): LoadResult {
  return { message, ok: false };
}
