import { defineAgent } from "eve";
import { exceedsSessionBudget } from "@/lib/agent-limits";

export default defineAgent({
  model: "anthropic/claude-sonnet-5.5",
  reasoning: "medium",
  limits: { sessionUsage: exceedsSessionBudget },
});
