import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import {
  encryptSecret,
  isTokenEncryptionConfigured,
  looksLikeSecretBox,
  openSecret,
  SecretBoxError,
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

// A row as callers see it. A secret that cannot be decrypted (the key was
// rotated or set wrong, or the box is damaged) comes back as null, with
// secretsUnreadable set, so one bad row never fails a whole list. Ciphertext is
// never returned.
export type McpConnectionRow = McpConnection & { readonly secretsUnreadable: boolean };

type OpenedSecrets = {
  readonly oauth: Record<string, unknown> | null;
  readonly oauthUnreadable: boolean;
  readonly token: string | null;
  readonly tokenUnreadable: boolean;
};

function tryOpen<T>(open: () => T): { readonly value: T } | null {
  try {
    return { value: open() };
  } catch (error) {
    if (error instanceof SecretBoxError) {
      return null;
    }

    throw error;
  }
}

function openSecrets(row: McpConnection): OpenedSecrets {
  const token = tryOpen(() => openSecret(row.token));
  const oauth = tryOpen(() => openOauth(row.oauth));

  return {
    oauth: oauth?.value ?? null,
    oauthUnreadable: oauth === null,
    token: token?.value ?? null,
    tokenUnreadable: token === null,
  };
}

// Decrypt a row for the caller. A row written before encryption existed still
// holds plaintext; it is returned as is and re-encrypted in place. A read never
// clears an unreadable secret: setting the right key brings it back.
async function openRow(row: McpConnection): Promise<McpConnectionRow> {
  const opened = openSecrets(row);

  await sealLegacySecrets(row);

  return {
    ...row,
    oauth: opened.oauth,
    secretsUnreadable: opened.tokenUnreadable || opened.oauthUnreadable,
    token: opened.token,
  };
}

// Opens the row an upsert wrote. A reconnect replaces secrets it cannot read
// instead of failing on them: each unreadable field is cleared to null, so the
// connection starts from fresh state. Each clear is a compare-and-set on the
// exact stored value, so newer state written meanwhile is never lost. With no
// key configured at all nothing is cleared, because setting the key would bring
// the row back.
async function openUpsertedRow(row: McpConnection): Promise<McpConnectionRow> {
  if (!isTokenEncryptionConfigured()) {
    return openRow(row);
  }

  const opened = openSecrets(row);

  if (opened.tokenUnreadable && row.token !== null) {
    await db
      .update(mcpConnection)
      .set({ token: null })
      .where(and(eq(mcpConnection.id, row.id), eq(mcpConnection.token, row.token)));
  }

  if (opened.oauthUnreadable) {
    await db
      .update(mcpConnection)
      .set({ oauth: null })
      .where(
        and(
          eq(mcpConnection.id, row.id),
          sql`${mcpConnection.oauth} = ${JSON.stringify(row.oauth)}::jsonb`,
        ),
      );
  }

  await sealLegacySecrets(row);

  return { ...row, oauth: opened.oauth, secretsUnreadable: false, token: opened.token };
}

// Re-encrypt plaintext secrets in place. Each update is a compare-and-set on the
// exact plaintext that was read, so a concurrent write of newer data is never
// overwritten by this stale value. This is best effort: the row was already read
// successfully, so a failure here must not fail the read, and the next read
// retries. Without a key there is nothing to do; writes refuse in that case. A
// damaged box is not plaintext and is never sealed as if it were.
async function sealLegacySecrets(row: McpConnection): Promise<void> {
  if (!isTokenEncryptionConfigured()) {
    return;
  }

  try {
    if (row.token !== null && !looksLikeSecretBox(row.token)) {
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

export async function listMcpConnections(userId: string): Promise<McpConnectionRow[]> {
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
): Promise<McpConnectionRow | null> {
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
// nothing is ever stored in plaintext. Secrets left on the row that no longer
// decrypt are cleared rather than read (see openUpsertedRow).
export async function upsertMcpConnection(input: UpsertMcpInput): Promise<McpConnectionRow> {
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

  return openUpsertedRow(rows[0]!);
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

// Merges into the stored OAuth state. State that no longer decrypts reads as
// empty, so the patch replaces it with fresh state instead of failing.
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

export async function getMcpByOauthState(state: string): Promise<McpConnectionRow | null> {
  const rows = await db
    .select()
    .from(mcpConnection)
    .where(eq(mcpConnection.oauthState, state))
    .limit(1);

  return rows[0] ? openRow(rows[0]) : null;
}
