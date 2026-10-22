import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  encryptSecret,
  isSecretBox,
  isTokenEncryptionConfigured,
  openSecret,
} from "@/lib/crypto/secret-box";
import { db } from "@/lib/db/client";
import { isSealedOauth, openOauth, sealOauth } from "@/lib/db/mcp-secrets";
import { mcpConnection, type McpConnection } from "@/lib/db/schema";

// Per-user MCP connection records. One row per (user, platform); the agent's
// connect/change/disconnect tools and the profile page all read/write here so
// MCP accounts live in the database instead of hardcoded env vars.
//
// Secrets are encrypted at rest: token is a secret box and oauth is { box }.
// Everything is sealed on the way in and opened on the way out in this file, so
// callers only ever see plaintext rows. oauth_state stays plaintext because the
// OAuth callback looks the row up by it.

// Decrypt a row for the caller. A row written before encryption existed still
// holds plaintext; it is returned as is and re-encrypted in place.
async function openRow(row: McpConnection): Promise<McpConnection> {
  const token = openSecret(row.token);
  const oauth = openOauth(row.oauth);

  await sealLegacySecrets(row);

  return { ...row, oauth, token };
}

// Re-encrypt plaintext secrets in place. Each update is a compare-and-set on the
// exact plaintext that was read, so a concurrent write of newer data is never
// overwritten by this stale value. This is best effort: the row was already read
// successfully, so a failure here must not fail the read, and the next read
// retries. Without a key there is nothing to do; writes refuse in that case.
async function sealLegacySecrets(row: McpConnection): Promise<void> {
  if (!isTokenEncryptionConfigured()) {
    return;
  }

  try {
    if (row.token !== null && !isSecretBox(row.token)) {
      await db
        .update(mcpConnection)
        .set({ token: encryptSecret(row.token) })
        .where(and(eq(mcpConnection.id, row.id), eq(mcpConnection.token, row.token)));
    }

    if (row.oauth !== null && !isSealedOauth(row.oauth)) {
      await db
        .update(mcpConnection)
        .set({ oauth: sealOauth(row.oauth) })
        .where(
          and(
            eq(mcpConnection.id, row.id),
            sql`${mcpConnection.oauth} = ${JSON.stringify(row.oauth)}::jsonb`,
          ),
        );
    }
  } catch (error) {
    console.error("Could not re-encrypt a legacy MCP secret", error);
  }
}

export async function listMcpConnections(userId: string): Promise<McpConnection[]> {
  const rows = await db
    .select()
    .from(mcpConnection)
    .where(eq(mcpConnection.userId, userId))
    .orderBy(mcpConnection.platform);

  return Promise.all(rows.map(openRow));
}

export async function getMcpConnection(
  userId: string,
  platform: string,
): Promise<McpConnection | null> {
  const rows = await db
    .select()
    .from(mcpConnection)
    .where(
      and(eq(mcpConnection.userId, userId), eq(mcpConnection.platform, platform.toLowerCase())),
    )
    .limit(1);

  return rows[0] ? openRow(rows[0]) : null;
}

export type UpsertMcpInput = {
  readonly userId: string;
  readonly platform: string;
  readonly url?: string | null;
  readonly token?: string | null;
  readonly account?: string | null;
  readonly enabled?: boolean;
};

// Connect or switch an account: one atomic insert that updates the existing row
// for this (user, platform) on conflict. Only fields that are provided are
// overwritten. A token is encrypted here, which throws when no key is set, so
// nothing is ever stored in plaintext.
export async function upsertMcpConnection(input: UpsertMcpInput): Promise<McpConnection> {
  const platform = input.platform.toLowerCase();
  const now = new Date();
  const token = typeof input.token === "string" ? encryptSecret(input.token) : input.token;
  const overwrite: Partial<typeof mcpConnection.$inferInsert> = { updatedAt: now };

  if (input.url !== undefined) overwrite.url = input.url;
  if (token !== undefined) overwrite.token = token;
  if (input.account !== undefined) overwrite.account = input.account;
  if (input.enabled !== undefined) overwrite.enabled = input.enabled;

  const rows = await db
    .insert(mcpConnection)
    .values({
      id: randomUUID(),
      userId: input.userId,
      platform,
      url: input.url ?? null,
      token: token ?? null,
      account: input.account ?? null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [mcpConnection.userId, mcpConnection.platform],
      set: overwrite,
    })
    .returning();

  return openRow(rows[0]!);
}

export async function deleteMcpConnection(userId: string, platform: string): Promise<boolean> {
  const rows = await db
    .delete(mcpConnection)
    .where(
      and(eq(mcpConnection.userId, userId), eq(mcpConnection.platform, platform.toLowerCase())),
    )
    .returning({ id: mcpConnection.id });

  return rows.length > 0;
}

// --- OAuth state (for MCP servers that sign in via OAuth) -------------------

export async function patchMcpOauth(
  userId: string,
  platform: string,
  partial: Record<string, unknown>,
): Promise<void> {
  const p = platform.toLowerCase();
  const existing = await getMcpConnection(userId, p);
  const merged = { ...(existing?.oauth ?? {}), ...partial };

  await db
    .update(mcpConnection)
    .set({ oauth: sealOauth(merged), updatedAt: new Date() })
    .where(and(eq(mcpConnection.userId, userId), eq(mcpConnection.platform, p)));
}

export async function setMcpOauthState(
  userId: string,
  platform: string,
  state: string | null,
): Promise<void> {
  const p = platform.toLowerCase();

  await db
    .update(mcpConnection)
    .set({ oauthState: state, updatedAt: new Date() })
    .where(and(eq(mcpConnection.userId, userId), eq(mcpConnection.platform, p)));
}

export async function getMcpByOauthState(state: string): Promise<McpConnection | null> {
  const rows = await db
    .select()
    .from(mcpConnection)
    .where(eq(mcpConnection.oauthState, state))
    .limit(1);

  return rows[0] ? openRow(rows[0]) : null;
}
