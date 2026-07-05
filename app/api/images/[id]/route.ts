import { getGeneratedImage } from "@/lib/db/images";

// Serves a generated image by id. Images are content-addressed by a random id
// and immutable, so they can be cached aggressively.
export async function GET(
  _request: Request,
  { params }: { readonly params: Promise<{ readonly id: string }> },
) {
  const { id } = await params;
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
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}
