import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveBrandContext } from "@/lib/mcp-context";
import { listVoiceExamples } from "@/lib/voice/store";

export default defineTool({
  description: "List the owner's saved example posts, newest first, for learning their voice.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).optional().describe("How many to return. Defaults to 20."),
  }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);
    if (!brandContext) return { ok: false, message: "You need to be signed in to list voice examples." };

    const examples = await listVoiceExamples(brandContext.brandId, input.limit ?? 20);
    return { ok: true, examples: examples.map((example) => ({ platform: example.platform, text: example.text })) };
  },
});
