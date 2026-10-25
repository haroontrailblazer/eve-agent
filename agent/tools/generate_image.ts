import { defineTool } from "eve/tools";
import { z } from "zod";
import type { SourceImage } from "@/lib/image-gen";
import { resolveBrandContext } from "@/lib/mcp-context";
import { generateBrandImage } from "@/lib/media/generate";
import { loadSourceImage } from "@/lib/media/load-source-image";

export default defineTool({
  description:
    "Generate an image from a text prompt, or edit/enhance an existing image. To create a new image, give a descriptive `prompt`. To edit or enhance an image, also pass `sourceImageUrl`, the url of an image the user attached or an image you generated earlier, and describe the change in `prompt` (e.g. 'make the background a sunset', 'enhance to higher quality', 'add a hat'). Returns a hosted image URL and a ready-to-use markdown snippet. ALWAYS include the returned `markdown` verbatim in your reply so the user sees the image inline.",
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe(
        "What to generate, or how to change the source image. Be specific about subject, style, and details.",
      ),
    sourceImageUrl: z
      .string()
      .optional()
      .describe(
        "Optional url of an image to edit/enhance: an attached image's url or a url this tool returned. Other websites are not supported. Omit to generate a brand-new image from the prompt alone.",
      ),
  }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);

    if (!brandContext) {
      return { ok: false, message: "You need to be signed in to generate images." };
    }

    const { brandId, userId } = brandContext;
    let sourceImage: SourceImage | undefined;

    if (input.sourceImageUrl) {
      const loaded = await loadSourceImage(input.sourceImageUrl);

      if (!loaded.ok) {
        return {
          ok: false,
          message: `Couldn't load the source image at ${input.sourceImageUrl}: ${loaded.message}`,
        };
      }

      sourceImage = loaded.image;
    }

    const saved = await generateBrandImage({ brandId, userId, prompt: input.prompt, sourceImage });

    if (!saved.ok) {
      return { ok: false, message: saved.message };
    }

    // Brackets would end the markdown alt text early.
    const altText = input.prompt.replace(/[[\]]/g, "").replace(/\s+/g, " ").slice(0, 80);

    return {
      ok: true,
      imageUrl: saved.url,
      markdown: `![${altText}](${saved.url})`,
      message: sourceImage
        ? `Edited image ready: ${saved.url}`
        : `Generated image ready: ${saved.url}`,
    };
  },
});
