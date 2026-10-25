// The 24-hour customer service window. Every inbound message or tap reopens
// it; while it is open harpy can send free-form messages, otherwise only
// templates. Without Redis the window counts as closed, so harpy falls back to
// templates.

import { getRedis } from "@/lib/redis";

export const WINDOW_SECONDS = 86_400;
// Stop trusting the window a little early so a card never races its expiry.
export const WINDOW_SAFETY_SECONDS = 600;

function windowKey(waId: string): string {
  return `wa:window:${waId}`;
}

export async function touchWindow(waId: string, now: Date = new Date()): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.set(windowKey(waId), now.toISOString(), { ex: WINDOW_SECONDS });
}

export async function isWindowOpen(waId: string, now: Date = new Date()): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;

  const stored = await redis.get<string>(windowKey(waId));
  if (typeof stored !== "string") return false;

  const last = Date.parse(stored);
  if (Number.isNaN(last)) return false;

  return now.getTime() - last < (WINDOW_SECONDS - WINDOW_SAFETY_SECONDS) * 1000;
}
