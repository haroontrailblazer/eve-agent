import { gateway, generateText, type ModelMessage } from "ai";

// Google's Gemini 2.5 Flash Image ("nano banana") both generates images from a
// prompt and edits an input image — one model for both paths. Routed through
// the same Vercel AI Gateway the agent already uses for its language model.
const IMAGE_MODEL = "google/gemini-2.5-flash-image";

export type GeneratedImageResult = {
  readonly base64: string;
  readonly mediaType: string;
};

export type SourceImage = {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
};

export async function generateOrEditImage(input: {
  readonly prompt: string;
  readonly sourceImage?: SourceImage;
}): Promise<GeneratedImageResult> {
  const content: ModelMessage["content"] = [
    { type: "text", text: input.prompt },
    ...(input.sourceImage
      ? [
          {
            type: "image" as const,
            image: input.sourceImage.bytes,
            mediaType: input.sourceImage.mediaType,
          },
        ]
      : []),
  ];

  const result = await generateText({
    model: gateway(IMAGE_MODEL),
    messages: [{ role: "user", content }],
    // Gemini only returns image bytes when image output is explicitly requested.
    providerOptions: { google: { responseModalities: ["TEXT", "IMAGE"] } },
  });

  const imageFile = result.files.find((file) => file.mediaType.startsWith("image/"));

  if (!imageFile) {
    throw new Error(
      "The image model returned no image. It may have refused the request or the gateway may not have image models enabled.",
    );
  }

  return { base64: imageFile.base64, mediaType: imageFile.mediaType };
}
