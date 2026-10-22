import { describe, expect, it } from "vitest";
import { exceedsSessionBudget } from "@/lib/agent-limits";

const w = (costUsd: number | undefined, inputTokens: number, cacheReadTokens: number) => ({
  window: { costUsd, inputTokens, cacheReadTokens },
});

describe("exceedsSessionBudget", () => {
  it("stops at $5", () => expect(exceedsSessionBudget(w(5, 0, 0))).toBe(true));
  it("allows $4.99", () => expect(exceedsSessionBudget(w(4.99, 0, 0))).toBe(false));
  it("falls back to 2M uncached input tokens", () =>
    expect(exceedsSessionBudget(w(undefined, 2_100_000, 100_000))).toBe(true));
  it("allows 1.9M uncached tokens", () =>
    expect(exceedsSessionBudget(w(undefined, 2_100_000, 200_000))).toBe(false));
});
