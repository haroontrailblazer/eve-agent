import { Redis } from "@upstash/redis";

let redis: Redis | null | undefined;

function getRedisEnv() {
  const url = process.env.UPSTASH_REDIS_REST_URL?.trim() || process.env.KV_REST_API_URL?.trim();
  const token =
    process.env.UPSTASH_REDIS_REST_TOKEN?.trim() || process.env.KV_REST_API_TOKEN?.trim();

  return url && token ? { token, url } : null;
}

// The shared Upstash client, or null when no Redis env is configured.
export function getRedis(): Redis | null {
  if (redis !== undefined) {
    return redis;
  }

  const env = getRedisEnv();

  if (!env) {
    redis = null;
    return redis;
  }

  redis = new Redis(env);
  return redis;
}
