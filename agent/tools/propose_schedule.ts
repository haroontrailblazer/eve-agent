import { defineTool } from "eve/tools";
import { z } from "zod";
import { normalizeProposedTime } from "@/lib/drafts/schedule";
import { resolveBrandContext } from "@/lib/mcp-context";
import { reviewFailureMessage, setProposedTime } from "@/lib/review";

export default defineTool({
  description:
    "Suggest a posting time for a draft that is waiting for review. The owner still has to approve it. Use ISO 8601 with an offset.",
  inputSchema: z.object({
    draftId: z.string().min(1).describe("The id of the draft."),
    scheduledAt: z.string().min(1).describe("The suggested time, ISO 8601 with an offset, for example 2026-11-02T09:00:00+05:30."),
  }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);
    if (!brandContext) return { ok: false, message: "You need to be signed in to propose a time." };

    const time = normalizeProposedTime(input.scheduledAt, new Date());
    if (!time.ok) return { ok: false, message: time.message };

    const result = await setProposedTime({ brandId: brandContext.brandId, draftId: input.draftId, scheduledAt: time.iso });
    if (!result.ok) return { ok: false, message: reviewFailureMessage(result.reason) };
    return { ok: true, draftId: result.draft.id, scheduledAt: result.draft.scheduledAt };
  },
});
