import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveBrandContext } from "@/lib/mcp-context";
import { saveMediaAsset } from "@/lib/media/assets";
import { readAttachmentImage } from "@/lib/media/attachments";

export default defineTool({
  description:
    "Save a photo the owner sent so it can go on posts or be edited. Returns a mediaId for draft_posts (imageMediaId) and a url.",
  inputSchema: z.object({
    path: z.string().min(1).describe("The photo's path from its Attached file label."),
  }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);
    if (!brandContext) return { ok: false, message: "You need to be signed in to save photos." };

    const photo = await readAttachmentImage(ctx, input.path);
    if (!photo.ok) return { ok: false, message: photo.message };

    const channel = ctx.session.auth.current?.attributes?.channel;
    try {
      const saved = await saveMediaAsset({
        brandId: brandContext.brandId,
        userId: brandContext.userId,
        bytes: photo.bytes,
        mediaType: photo.mediaType,
        source: channel === "whatsapp" ? "whatsapp" : "uploaded",
      });
      return { ok: true, mediaId: saved.id, url: saved.url };
    } catch {
      return { ok: false, message: "Couldn't save that photo. Try again." };
    }
  },
});
