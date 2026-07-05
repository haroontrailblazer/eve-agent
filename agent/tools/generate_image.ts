import { defineTool } from "eve/tools";
import { z } from "zod";
import { saveGeneratedImage } from "@/lib/db/images";
import { generateOrEditImage, type SourceImage } from "@/lib/image-gen";
import { errorMessage } from "@/lib/mcp-client";
import { resolveDbUserId } from "@/lib/mcp-context";
import { getAppOrigin } from "@/lib/mcp-oauth";

export default defineTool({
  description:
    "Generate an image from a text prompt, or edit/enhance an existing image. To create a new image, give a descriptive `prompt`. To edit or enhance an image, also pass `sourceImageUrl` — a public image URL, or the URL of an image you generated earlier — and describe the change in `prompt` (e.g. 'make the background a sunset', 'enhance to higher quality', 'add a hat'). Returns a hosted image URL and a ready-to-use markdown snippet. ALWAYS include the returned `markdown` verbatim in your reply so the user sees the image inline.",
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
        "Optional URL of an image to edit/enhance. Omit to generate a brand-new image from the prompt alone.",
      ),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to generate images." };
    }

    let sourceImage: SourceImage | undefined;

    if (input.sourceImageUrl) {
      try {
        const response = await fetch(input.sourceImageUrl);

        if (!response.ok) {
          throw new Error(`fetch returned ${response.status}`);
        }

        const mediaType = response.headers.get("content-type")?.split(";")[0] ?? "image/png";

        if (!mediaType.startsWith("image/")) {
          return {
            ok: false,
            message: `That URL isn't an image (${mediaType}). Give me a direct link to an image file.`,
          };
        }

        sourceImage = {
          bytes: new Uint8Array(await response.arrayBuffer()),
          mediaType,
        };
      } catch (error) {
        return {
          ok: false,
          message: `Couldn't load the source image at ${input.sourceImageUrl}: ${errorMessage(error)}`,
        };
      }
    }

    let generated;
    try {
      generated = await generateOrEditImage({ prompt: input.prompt, sourceImage });
    } catch (error) {
      return {
        ok: false,
        message: `Image generation failed: ${errorMessage(error)}. Make sure the AI Gateway has Google Gemini image models enabled.`,
      };
    }

    let id: string;
    try {
      id = await saveGeneratedImage({
        base64: generated.base64,
        mediaType: generated.mediaType,
        prompt: input.prompt,
        userId,
      });
    } catch (error) {
      return { ok: false, message: `Generated the image but couldn't save it: ${errorMessage(error)}` };
    }

    const url = `${getAppOrigin().replace(/\/$/, "")}/api/images/${id}`;
    const altText = input.prompt.replace(/\s+/g, " ").slice(0, 80);

    return {
      ok: true,
      imageUrl: url,
      // Relative src so it resolves against the browser origin regardless of how
      // getAppOrigin() is configured (avoids a wrong absolute host 404ing).
      markdown: `![${altText}](/api/images/${id})`,
      message: sourceImage
        ? `Edited image ready: ${url}`
        : `Generated image ready: ${url}`,
    };
  },
});
