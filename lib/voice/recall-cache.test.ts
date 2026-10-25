import type { Redis } from "@upstash/redis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RECALL_CACHE_TTL_SECONDS, withRecallCache } from "@/lib/voice/recall-cache";

function fakeRedis(options: { stored?: unknown; getThrows?: boolean; setThrows?: boolean } = {}) {
  const get = vi.fn(async () => {
    if (options.getThrows) throw new Error("get down");
    return options.stored ?? null;
  });
  const set = vi.fn(async () => {
    if (options.setThrows) throw new Error("set down");
    return "OK";
  });
  return { redis: { get, set } as unknown as Redis, get, set };
}

afterEach(() => vi.restoreAllMocks());

describe("withRecallCache", () => {
  it("computes once on a miss and stores with a ttl", async () => {
    const { redis, get, set } = fakeRedis();
    const compute = vi.fn(async () => ({ messages: [] }));
    const result = await withRecallCache("op1", compute, redis);
    expect(result).toEqual({ messages: [] });
    expect(get).toHaveBeenCalledWith("voice:recall:op1");
    expect(compute).toHaveBeenCalledTimes(1);
    expect(set).toHaveBeenCalledWith("voice:recall:op1", { value: { messages: [] } }, { ex: 604800 });
    expect(RECALL_CACHE_TTL_SECONDS).toBe(604_800);
  });

  it("returns a hit without computing", async () => {
    const { redis, set } = fakeRedis({ stored: { value: { messages: [{ id: "x", content: "y" }] } } });
    const compute = vi.fn(async () => ({ messages: [] }));
    expect(await withRecallCache("op1", compute, redis)).toEqual({ messages: [{ id: "x", content: "y" }] });
    expect(compute).not.toHaveBeenCalled();
    expect(set).not.toHaveBeenCalled();
  });

  it("returns a cached null outcome without computing", async () => {
    const { redis } = fakeRedis({ stored: { value: null } });
    const compute = vi.fn(async () => 5);
    expect(await withRecallCache("op1", compute, redis)).toBeNull();
    expect(compute).not.toHaveBeenCalled();
  });

  it("computes without caching when redis is null", async () => {
    const compute = vi.fn(async () => 5);
    expect(await withRecallCache("op1", compute, null)).toBe(5);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("stores a null outcome and returns null when compute fails", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { redis, set } = fakeRedis();
    const result = await withRecallCache("op1", async () => { throw new Error("db down"); }, redis);
    expect(result).toBeNull();
    expect(set).toHaveBeenCalledWith("voice:recall:op1", { value: null }, { ex: 604800 });
  });

  it("returns the computed value when set throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { redis } = fakeRedis({ setThrows: true });
    expect(await withRecallCache("op1", async () => 7, redis)).toBe(7);
  });

  it("falls back to computing when get throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { redis } = fakeRedis({ getThrows: true });
    const compute = vi.fn(async () => 9);
    expect(await withRecallCache("op1", compute, redis)).toBe(9);
    expect(compute).toHaveBeenCalledTimes(1);
  });

  it("rethrows an AbortError and does not cache it", async () => {
    const { redis, set } = fakeRedis();
    const abort = Object.assign(new Error("aborted"), { name: "AbortError" });
    await expect(withRecallCache("op1", async () => { throw abort; }, redis)).rejects.toBe(abort);
    expect(set).not.toHaveBeenCalled();
  });

  it("rethrows any failure when the signal is aborted", async () => {
    const { redis, set } = fakeRedis();
    const controller = new AbortController();
    controller.abort();
    const failure = new Error("db down");
    await expect(
      withRecallCache("op1", async () => { throw failure; }, redis, controller.signal),
    ).rejects.toBe(failure);
    expect(set).not.toHaveBeenCalled();
  });
});
