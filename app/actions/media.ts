"use server";

import { z } from "zod";
import { getBrandIdForUser } from "@/lib/brand-access";
import { recordUploadedMedia } from "@/lib/media/assets";
import { getServerViewer } from "@/lib/session";

const uploadedMediaSchema = z.object({
  contentType: z.string(),
  pathname: z.string(),
  size: z.number(),
  url: z.string(),
});

// Records an image the browser just uploaded to Blob in the viewer's brand.
// recordUploadedMedia checks the url, pathname, type and size.
export async function recordUploadedMediaAction(input: {
  url: string;
  pathname: string;
  contentType: string;
  size: number;
}): Promise<{ id: string; url: string }> {
  const viewer = await getServerViewer();

  if (!viewer) {
    throw new Error("Sign in with Vercel to continue.");
  }

  const upload = uploadedMediaSchema.parse(input);
  const brandId = await getBrandIdForUser(viewer);

  return recordUploadedMedia({ ...upload, brandId, userId: viewer.id });
}
