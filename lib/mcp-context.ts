import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

// Resolve the signed-in user from an eve tool's `ctx`. Per eve's SessionContext,
// ctx.session.auth is { current, initiator } and each is a SessionAuthContext
// with principalId (= user.id, set by betterAuthEveAuth) and subject (= email).

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

// Kept for connection getToken(), which receives a principal object directly.
export function resolvePrincipalId(principal: unknown): string | null {
  const p = principal as Record<string, unknown> | null | undefined;

  if (!p) {
    return null;
  }

  const current = p.current as Record<string, unknown> | undefined;
  const initiator = p.initiator as Record<string, unknown> | undefined;
  const nested = p.principal as Record<string, unknown> | undefined;

  return pickString(
    p.principalId,
    p.id,
    current?.principalId,
    initiator?.principalId,
    nested?.principalId,
    nested?.id,
  );
}

function extractAuthContext(ctx: unknown): Record<string, unknown> | undefined {
  const auth = (
    ctx as { session?: { auth?: { current?: unknown; initiator?: unknown } } } | null | undefined
  )?.session?.auth;

  return (auth?.current ?? auth?.initiator ?? undefined) as Record<string, unknown> | undefined;
}

// Resolve to a REAL user.id that exists in the database. Tries the auth
// principal id, then the authenticated email — and only returns an id confirmed
// to exist, so writes never violate the user foreign key.
export async function resolveDbUserId(ctx: unknown): Promise<string | null> {
  const authCtx = extractAuthContext(ctx);
  const candidateId = pickString(authCtx?.principalId);
  const attributes = authCtx?.attributes as Record<string, unknown> | undefined;
  const email = pickString(authCtx?.subject, attributes?.email);

  if (candidateId) {
    const byId = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, candidateId))
      .limit(1);

    if (byId[0]) {
      return byId[0].id;
    }
  }

  if (email) {
    const byEmail = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (byEmail[0]) {
      return byEmail[0].id;
    }
  }

  return null;
}
