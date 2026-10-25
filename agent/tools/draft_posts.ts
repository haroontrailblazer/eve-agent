import { defineWorkflowTool } from "eve/tools";
import { DRAFT_POSTS_INPUT, resolveTargets } from "@/lib/drafts/input";
import { runDrafting, writerConversation } from "@/lib/drafts/orchestrate";
import {
  attachDraftImageStep,
  attachPieceImageStep,
  generateImageStep,
  prepareDrafting,
  saveDraftStep,
  savePieceStep,
} from "@/lib/drafts/steps";
import type { DraftTarget } from "@/lib/drafts/types";
import { PLATFORMS } from "@/lib/platforms";

function targetLabel(target: DraftTarget): string {
  if (target.kind === "post") return PLATFORMS[target.platform].label;
  return target.piece === "reel_script" ? "reel script" : "carousel outline";
}

export default defineWorkflowTool({
  description:
    "Draft posts for X, LinkedIn and Threads, and optionally a reel script or carousel outline, from an idea in the owner's voice. Saves every draft for review in Studio. Never publishes. Pass ideaId for Studio requests; otherwise pass idea and any sources you fetched.",
  inputSchema: DRAFT_POSTS_INPUT,
  label: {
    // A saved idea's own platforms are only known inside the run.
    start: (input) =>
      input.ideaId && !input.platforms?.length && !input.pieces?.length
        ? "Drafting posts"
        : `Drafting ${resolveTargets(input, null).map(targetLabel).join(", ")}`,
  },
  async execute(input, ctx) {
    "use workflow";

    const prepared = await prepareDrafting(ctx, input);
    if (!prepared.ok) return prepared;
    const { plan, brandId, userId } = prepared;

    return runDrafting(
      {
        openWriter: () => writerConversation(ctx.agent("writer"), ctx.abortSignal),
        saveDraft: (draft) => saveDraftStep({ ...draft, brandId }),
        savePiece: (piece) => savePieceStep({ ...piece, brandId }),
        generateImage: (prompt) => generateImageStep({ brandId, userId, prompt }),
        attachDraftImage: (image) => attachDraftImageStep({ ...image, brandId }),
        attachPieceImage: (image) => attachPieceImageStep({ ...image, brandId }),
      },
      plan,
    );
  },
});
