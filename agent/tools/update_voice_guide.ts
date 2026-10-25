import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveBrandContext } from "@/lib/mcp-context";
import { getActiveVoiceGuide, saveVoiceGuideVersion } from "@/lib/voice/store";

export default defineTool({
  description:
    "Save a new version of the owner's brand voice guide. Use only when the owner asks you to rewrite or update their guide.",
  inputSchema: z.object({
    body: z.string().min(50).max(12_000).describe("The full new guide text."),
    note: z.string().max(200).describe("A short note on what changed."),
  }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);
    if (!brandContext) return { ok: false, message: "You need to be signed in to update the voice guide." };

    const current = await getActiveVoiceGuide(brandContext.brandId);
    const result = await saveVoiceGuideVersion({
      brandId: brandContext.brandId,
      userId: brandContext.userId,
      body: input.body,
      note: input.note,
      source: "harpy",
      basedOnVersion: current.version,
    });

    if (!result.ok) {
      return { ok: false, message: "The guide changed while you were writing. Read it again and retry." };
    }

    return { ok: true, version: result.guide.version };
  },
});
