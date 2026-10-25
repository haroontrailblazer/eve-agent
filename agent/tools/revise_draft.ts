import { defineWorkflowTool } from "eve/tools";
import { z } from "zod";
import { runRevision, writerConversation } from "@/lib/drafts/orchestrate";
import {
  abandonRevisionStep,
  attachDraftImageStep,
  completeRevisionStep,
  generateImageStep,
  prepareRevision,
} from "@/lib/drafts/steps";

export default defineWorkflowTool({
  description: "Rewrite one saved draft following the owner's requested change. Creates a new revision for review. Never publishes.",
  inputSchema: z.object({
    draftId: z.string().min(1).describe("The id of the draft to rewrite."),
    instruction: z.string().min(1).max(2000).describe("The change the owner asked for."),
    regenerateImage: z.boolean().optional().describe("Make a new image for the revised draft. Defaults to keeping the current media."),
    allowLinksOnX: z
      .boolean()
      .optional()
      .describe("Set when the owner asks to include a link on X; a post with a link costs $0.20."),
  }),
  label: { start: () => "Revising the draft" },
  async execute(input, ctx) {
    "use workflow";

    const prepared = await prepareRevision(ctx, input);
    if (!prepared.ok) return prepared;
    const { plan, brandId, userId } = prepared;

    return runRevision(
      {
        openWriter: () => writerConversation(ctx.agent("writer"), ctx.abortSignal),
        complete: (revision) =>
          completeRevisionStep({
            ...revision,
            brandId,
            draftId: plan.draftId,
            expectedRevision: plan.revision,
            instruction: plan.instruction,
            userId,
          }),
        abandon: () => abandonRevisionStep({ brandId, draftId: plan.draftId }),
        generateImage: (prompt) => generateImageStep({ brandId, userId, prompt }),
        attachDraftImage: (image) => attachDraftImageStep({ ...image, brandId }),
      },
      plan,
    );
  },
});
