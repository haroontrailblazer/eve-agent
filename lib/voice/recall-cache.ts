import type { Redis } from "@upstash/redis";
import { getRedis } from "@/lib/redis";

export const RECALL_CACHE_TTL_SECONDS = 604_800;

// eve may replay a recall handler with the same operation id and requires the
// same result, so the first result is kept for a week. A cache failure never
// breaks a turn: it falls back to computing.
export async function withRecallCache<T>(
  operationId: string,
  compute: () => Promise<T>,
  redis: Redis | null = getRedis(),
): Promise<T> {
  if (!redis) {
    return compute();
  }

  const key = `voice:recall:${operationId}`;

  try {
    const cached = await redis.get<T>(key);

    if (cached !== null && cached !== undefined) {
      return cached;
    }
  } catch (error) {
    console.warn("voice recall cache read failed", error);
  }

  const value = await compute();

  try {
    await redis.set(key, value, { ex: RECALL_CACHE_TTL_SECONDS });
  } catch (error) {
    console.warn("voice recall cache write failed", error);
  }

  return value;
}
