import { randomInt } from "node:crypto";
import { isEmailAllowed } from "@/lib/allowlist";
import { findEmailByUserId, isBrandMember } from "@/lib/db/brands";
import { type ChannelIdentityKind, linkIdentity } from "@/lib/db/channel-identities";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { getRedis } from "@/lib/redis";

// Short-lived codes that link a chat sender to a signed-in harpy user: the
// user creates one in the app and sends "LINK <code>" from the chat.

export const LINK_CODE_TTL_SECONDS = 600;
export const LINK_ATTEMPTS_PER_HOUR = 5;
export const LINK_ATTEMPTS_ALL_PER_HOUR = 30;
export const LINK_CODES_PER_HOUR = 10;

const HOUR_SECONDS = 3600;
const MAX_COLLISION_RETRIES = 5;

export class LinkCodeUnavailableError extends Error {
  constructor() {
    super("Link codes are unavailable right now.");
  }
}

type StoredCode = { readonly userId: string; readonly brandId: string };

const codeKey = (channel: ChannelIdentityKind, code: string) => `link:code:${channel}:${code}`;
const userKey = (channel: ChannelIdentityKind, userId: string) => `link:user:${channel}:${userId}`;

export function parseLinkCommand(text: string): string | null {
  return /^\s*link\s+(\d{6})\s*$/i.exec(text)?.[1] ?? null;
}

export async function createLinkCode(input: {
  readonly userId: string;
  readonly brandId: string;
  readonly channel: ChannelIdentityKind;
}): Promise<{ readonly code: string; readonly expiresAt: string }> {
  const redis = getRedis();

  if (!redis) {
    throw new LinkCodeUnavailableError();
  }

  await enforceRateLimit({
    key: input.userId,
    limit: LINK_CODES_PER_HOUR,
    prefix: "link:create",
    windowSeconds: HOUR_SECONDS,
  });

  // One live code per user and channel: a new code replaces the old one.
  const previous = await redis.get<string | number>(userKey(input.channel, input.userId));

  if (previous !== null && previous !== undefined) {
    await redis.del(codeKey(input.channel, String(previous).padStart(6, "0")));
  }

  const value = JSON.stringify({ brandId: input.brandId, userId: input.userId });

  for (let attempt = 0; attempt < MAX_COLLISION_RETRIES; attempt += 1) {
    const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
    const written = await redis.set(codeKey(input.channel, code), value, {
      ex: LINK_CODE_TTL_SECONDS,
      nx: true,
    });

    if (written) {
      await redis.set(userKey(input.channel, input.userId), code, { ex: LINK_CODE_TTL_SECONDS });
      return { code, expiresAt: new Date(Date.now() + LINK_CODE_TTL_SECONDS * 1000).toISOString() };
    }
  }

  throw new LinkCodeUnavailableError();
}

export type RedeemResult =
  | { readonly ok: true; readonly email: string }
  | { readonly ok: false; readonly reason: "invalid" | "limited" | "unavailable" };

export async function redeemLinkCode(input: {
  readonly channel: ChannelIdentityKind;
  readonly externalId: string;
  readonly code: string;
  readonly phone?: string | null;
  readonly bsuid?: string | null;
}): Promise<RedeemResult> {
  const redis = getRedis();

  if (!redis) {
    return { ok: false, reason: "unavailable" };
  }

  try {
    await enforceRateLimit({
      key: `${input.channel}:${input.externalId}`,
      limit: LINK_ATTEMPTS_PER_HOUR,
      prefix: "link:attempt",
      windowSeconds: HOUR_SECONDS,
    });
    await enforceRateLimit({
      key: "all",
      limit: LINK_ATTEMPTS_ALL_PER_HOUR,
      prefix: "link:attempt:all",
      windowSeconds: HOUR_SECONDS,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return { ok: false, reason: "limited" };
    }

    throw error;
  }

  // getdel makes a code single use, even under concurrent redeems.
  const raw = await redis.getdel<StoredCode | string>(codeKey(input.channel, input.code));
  const stored = typeof raw === "string" ? (JSON.parse(raw) as StoredCode) : raw;

  if (!stored) {
    return { ok: false, reason: "invalid" };
  }

  const email = await findEmailByUserId(stored.userId);

  if (!email || !isEmailAllowed(email) || !(await isBrandMember(stored.brandId, stored.userId))) {
    return { ok: false, reason: "invalid" };
  }

  await linkIdentity({
    brandId: stored.brandId,
    bsuid: input.bsuid ?? null,
    channel: input.channel,
    externalId: input.externalId,
    phone: input.phone ?? null,
    userId: stored.userId,
  });
  await redis.del(userKey(input.channel, stored.userId));

  return { email, ok: true };
}
