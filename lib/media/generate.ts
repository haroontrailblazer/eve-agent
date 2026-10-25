import { generateOrEditImage, type SourceImage } from "@/lib/image-gen";
import { errorMessage } from "@/lib/mcp-client";
import { saveMediaAsset } from "@/lib/media/assets";
import { IMAGE_GENERATIONS_PER_DAY } from "@/lib/media/limits";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isMediaConfigured } from "@/lib/setup";

const DAY_SECONDS = 86_400;
export const MEDIA_NOT_CONFIGURED_MESSAGE = "Images need a Blob store. Connect one in Vercel to add images.";

// Server only. Generates (or edits) one image for a brand under the daily
// image limit and stores it as a media asset. Never throws. Without a Blob
// store it stops before the limit and the model, so a failed save never
// costs an image.
export async function generateBrandImage(input: {
  readonly brandId: string;
  readonly userId: string;
  readonly prompt: string;
  readonly sourceImage?: SourceImage;
}): Promise<{ readonly ok: true; readonly mediaId: string; readonly url: string } | { readonly ok: false; readonly message: string }> {
  if (!isMediaConfigured()) {
    return { ok: false, message: MEDIA_NOT_CONFIGURED_MESSAGE };
  }

  try {
    await enforceRateLimit({
      key: input.brandId,
      limit: IMAGE_GENERATIONS_PER_DAY,
      prefix: "image:generate",
      windowSeconds: DAY_SECONDS,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        ok: false,
        message: `Image limit reached for today (${IMAGE_GENERATIONS_PER_DAY}). Try again tomorrow.`,
      };
    }

    return { ok: false, message: `Couldn't check the image limit: ${errorMessage(error)}` };
  }

  let generated;
  try {
    generated = await generateOrEditImage({ prompt: input.prompt, sourceImage: input.sourceImage });
  } catch (error) {
    return {
      ok: false,
      message: `Image generation failed: ${errorMessage(error)}. Make sure the AI Gateway has Google Gemini image models enabled.`,
    };
  }

  try {
    const saved = await saveMediaAsset({
      brandId: input.brandId,
      bytes: Buffer.from(generated.base64, "base64"),
      mediaType: generated.mediaType,
      prompt: input.prompt,
      source: "generated",
      userId: input.userId,
    });
    return { ok: true, mediaId: saved.id, url: saved.url };
  } catch (error) {
    return { ok: false, message: `Generated the image but couldn't save it: ${errorMessage(error)}` };
  }
}
