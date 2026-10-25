import type { Redis } from "@upstash/redis";
import { getRedis } from "@/lib/redis";

export const RECALL_CACHE_TTL_SECONDS = 604_800;

function isAbort(error: unknown, signal?: AbortSignal): boolean {
  return signal?.aborted === true || (error as { name?: unknown } | null)?.name === "AbortError";
}

// eve may replay a recall handler with the same operation id and requires the
// same result, so the first outcome is kept for a week, including a failed
// compute (stored as a null outcome). The cached value is wrapped so a cached
// null differs from a miss. A Redis error never breaks a turn, and an abort is
// rethrown so eve treats it as cancellation.
export async function withRecallCache<T>(
  operationId: string,
  compute: () => Promise<T>,
  redis: Redis | null = getRedis(),
  signal?: AbortSignal,
): Promise<T | null> {
  const key = `voice:recall:${operationId}`;

  async function remember(value: T | null) {
    if (!redis) return;
    try {
      await redis.set(key, { value }, { ex: RECALL_CACHE_TTL_SECONDS });
    } catch (error) {
      console.warn("voice recall cache write failed", error);
    }
  }

  if (redis) {
    try {
      const cached = await redis.get<{ value: T | null }>(key);

      if (cached && typeof cached === "object" && "value" in cached) {
        return cached.value;
      }
    } catch (error) {
      console.warn("voice recall cache read failed", error);
    }
  }

  let value: T | null;

  try {
    value = await compute();
  } catch (error) {
    if (isAbort(error, signal)) {
      throw error;
    }

    console.warn("voice recall failed", error);
    value = null;
  }

  await remember(value);
  return value;
}
