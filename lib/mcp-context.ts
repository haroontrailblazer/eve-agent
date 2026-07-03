import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

// Resolve the signed-in user from an eve tool's `ctx` or a connection's
// `principal`. betterAuthEveAuth (lib/eve-auth.ts) stamps principalId = user.id
// and subject = email onto ctx.session.auth (see eve RuntimeSessionAuthContext).

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return null;
}

export function resolvePrincipalId(principal: unknown): string | null {
  const p = principal as Record<string, unknown> | null | undefined;

  if (!p) {
    return null;
  }

  const nested = p.principal as Record<string, unknown> | undefined;

  return pickString(p.principalId, p.id, nested?.principalId, nested?.id);
}

function extractAuth(ctx: unknown): Record<string, unknown> | undefined {
  const session = (ctx as { session?: { auth?: unknown } } | null | undefined)?.session;
  return (session?.auth ?? undefined) as Record<string, unknown> | undefined;
}

// Resolve to a REAL user.id that exists in the database. Tries the auth
// principal id first, then the authenticated email — and only returns an id
// confirmed to exist, so writes never violate the user foreign key. Returns
// null when no signed-in user can be resolved.
export async function resolveDbUserId(ctx: unknown): Promise<string | null> {
  const auth = extractAuth(ctx);
  const candidateId = resolvePrincipalId(auth);
  const attributes = auth?.attributes as Record<string, unknown> | undefined;
  const email = pickString(auth?.subject, attributes?.email);

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
