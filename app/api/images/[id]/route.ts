import { getGeneratedImage } from "@/lib/db/images";
import { getMediaAsset } from "@/lib/media/assets";
import { isUuid } from "@/lib/media/source-url";

const IMMUTABLE_CACHE = "public, max-age=31536000, immutable";

// Serves an image by id. Media assets redirect to their public Blob url; images
// saved before media moved to Blob are served from their base64 rows. Ids are
// random and images never change, so both cache aggressively.
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await params;

  if (!isUuid(id)) {
    return new Response("Image not found.", { status: 404 });
  }

  const asset = await getMediaAsset(id);

  if (asset) {
    return new Response(null, {
      status: 308,
      headers: {
        "cache-control": IMMUTABLE_CACHE,
        location: asset.blobUrl,
      },
    });
  }

  const image = await getGeneratedImage(id);

  if (!image) {
    return new Response("Image not found.", { status: 404 });
  }

  const bytes = new Uint8Array(Buffer.from(image.data, "base64"));

  return new Response(bytes, {
    status: 200,
    headers: {
      "content-type": image.mediaType,
      "content-length": String(bytes.byteLength),
      "cache-control": IMMUTABLE_CACHE,
    },
  });
}
