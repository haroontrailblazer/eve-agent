// Per-session spend cap for the agent. eve calls this before each model call and
// pauses the turn with a continue/stop prompt once it returns true.
export const SESSION_BUDGET_USD = 5;
export const SESSION_BUDGET_UNCACHED_INPUT_TOKENS = 2_000_000;

interface SessionUsageWindow {
  readonly costUsd?: number;
  readonly inputTokens: number;
  readonly cacheReadTokens: number;
}

// `costUsd` is unset when no step reported a cost, so fall back to counting new
// (uncached) input tokens. `inputTokens` includes cache reads, so subtract them.
export function exceedsSessionBudget(usage: { readonly window: SessionUsageWindow }): boolean {
  const { costUsd, inputTokens, cacheReadTokens } = usage.window;

  return (
    (costUsd ?? 0) >= SESSION_BUDGET_USD ||
    inputTokens - cacheReadTokens >= SESSION_BUDGET_UNCACHED_INPUT_TOKENS
  );
}
