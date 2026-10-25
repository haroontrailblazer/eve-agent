import { generateOrEditImage, type SourceImage } from "@/lib/image-gen";
import { errorMessage } from "@/lib/mcp-client";
import { saveMediaAsset } from "@/lib/media/assets";
import { IMAGE_GENERATIONS_PER_DAY } from "@/lib/media/limits";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

const DAY_SECONDS = 86_400;

// Server only. Generates (or edits) one image for a brand under the daily
// image limit and stores it as a media asset. Never throws.
export async function generateBrandImage(input: {
  readonly brandId: string;
  readonly userId: string;
  readonly prompt: string;
  readonly sourceImage?: SourceImage;
}): Promise<{ readonly ok: true; readonly mediaId: string; readonly url: string } | { readonly ok: false; readonly message: string }> {
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
