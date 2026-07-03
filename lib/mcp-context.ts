// Resolve the signed-in user id from an eve tool's `ctx` or a connection's
// `principal`. betterAuthEveAuth (lib/eve-auth.ts) stamps principalId = user.id.

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

export function resolveUserId(ctx: unknown): string | null {
  const session = (ctx as { session?: Record<string, unknown> })?.session;
  const auth = session?.auth;

  return resolvePrincipalId(auth) ?? resolvePrincipalId(session);
}
