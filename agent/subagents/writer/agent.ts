import { defineAgent } from "eve";
import { exceedsSessionBudget } from "@/lib/agent-limits";

export default defineAgent({
  description:
    "Writes one post, thread, reel script or carousel outline in the owner's voice. Used by the draft_posts and revise_draft tools only.",
  model: "anthropic/claude-opus-5.5",
  reasoning: "high",
  tool: false,
  defaultTools: false,
  limits: { sessionUsage: exceedsSessionBudget },
});
