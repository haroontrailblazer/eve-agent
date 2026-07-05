"use server";

import { saveGeneratedImage } from "@/lib/db/images";
import { getAppOrigin } from "@/lib/mcp-oauth";
import { getServerViewer } from "@/lib/session";

// Store an uploaded image (data URL) and return a hosted /api/images/<id> URL.
// This bridges the gap that lets the agent edit/enhance an ATTACHED image: eve
// delivers the image to the model but a tool can't read the uploaded bytes, so
// we host it and hand the model the URL to pass to generate_image.
export async function uploadImageAction(input: {
  readonly dataUrl: string;
}): Promise<{ readonly ok: boolean; readonly url?: string }> {
  const viewer = await getServerViewer();

  if (!viewer) {
    return { ok: false };
  }

  const commaIndex = input.dataUrl.indexOf(",");

  if (!input.dataUrl.startsWith("data:") || commaIndex === -1) {
    return { ok: false };
  }

  const header = input.dataUrl.slice(5, commaIndex); // e.g. "image/png;base64"
  const base64 = input.dataUrl.slice(commaIndex + 1);
  const mediaType = header.split(";")[0] ?? "";

  if (!header.includes("base64") || !mediaType.startsWith("image/")) {
    return { ok: false };
  }

  try {
    const id = await saveGeneratedImage({
      base64,
      mediaType,
      prompt: "uploaded",
      userId: viewer.id,
    });

    return { ok: true, url: `${getAppOrigin().replace(/\/$/, "")}/api/images/${id}` };
  } catch {
    return { ok: false };
  }
}
