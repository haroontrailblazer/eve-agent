import type { Redis } from "@upstash/redis";
import { describe, expect, it, vi } from "vitest";
import { RECALL_CACHE_TTL_SECONDS, withRecallCache } from "@/lib/voice/recall-cache";

function fakeRedis(stored?: unknown) {
  const get = vi.fn(async () => stored ?? null);
  const set = vi.fn(async () => "OK");
  return { redis: { get, set } as unknown as Redis, get, set };
}

describe("withRecallCache", () => {
  it("computes once on a miss and stores with a ttl", async () => {
    const { redis, get, set } = fakeRedis();
    const compute = vi.fn(async () => ({ messages: [] }));
    const result = await withRecallCache("op1", compute, redis);
    expect(result).toEqual({ messages: [] });
    expect(get).toHaveBeenCalledWith("voice:recall:op1");
    expect(compute).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("voice:recall:op1", { messages: [] }, { ex: 604800 });
    expect(RECALL_CACHE_TTL_SECONDS).toBe(604_800);
  });

  it("returns a hit without computing", async () => {
    const { redis, set } = fakeRedis({ messages: [{ id: "x", content: "y" }] });
    const compute = vi.fn(async () => ({ messages: [] }));
    expect(await withRecallCache("op1", compute, redis)).toEqual({ messages: [{ id: "x", content: "y" }] });
    expect(compute).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("computes without caching when redis is null", async () => {
    const compute = vi.fn(async () => 5);
    expect(await withRecallCache("op1", compute, null)).toBe(5);
    expect(compute).toHaveBeenCalledTimes(1);
  });
});
