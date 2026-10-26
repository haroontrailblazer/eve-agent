import { defineTool } from "eve/tools";
import { z } from "zod";
import { resolveBrandContext } from "@/lib/mcp-context";
import { submitForReview } from "@/lib/whatsapp/submit";

export default defineTool({
  description:
    "Send saved drafts to the owner for review. On WhatsApp this sends one review card per draft with Approve, Edit and Skip. Elsewhere the drafts are already in Studio. Pass the ideaId from draft_posts, or the draftIds from revise_draft. Set resend when the owner asks to see cards again.",
  inputSchema: z
    .object({
      ideaId: z.string().max(100).optional(),
      draftIds: z.array(z.string().max(100)).min(1).max(10).optional(),
      resend: z.boolean().optional(),
    })
    .refine((input) => (input.ideaId === undefined) !== (input.draftIds === undefined), {
      message: "Pass exactly one of ideaId and draftIds.",
    }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);
    if (!brandContext) return { ok: false, message: "You need to be signed in to send drafts for review." };

    const attributes = ctx.session.auth.current?.attributes;
    const channel = attributes?.channel;
    const waId = attributes?.waId;

    return submitForReview({
      brandId: brandContext.brandId,
      channel: typeof channel === "string" ? channel : null,
      waId: typeof waId === "string" && waId ? waId : null,
      ideaId: input.ideaId,
      draftIds: input.draftIds,
      resendKey: input.resend ? ctx.callId : undefined,
    });
  },
});
