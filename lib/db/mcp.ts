import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { mcpConnection, type McpConnection } from "@/lib/db/schema";

// Per-user MCP connection records. One row per (user, platform); the agent's
// connect/change/disconnect tools and the profile page all read/write here so
// MCP accounts live in the database instead of hardcoded env vars.

export async function listMcpConnections(userId: string): Promise<McpConnection[]> {
  return db
    .select()
    .from(mcpConnection)
    .where(eq(mcpConnection.userId, userId))
    .orderBy(mcpConnection.platform);
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

  return rows[0] ?? null;
}

export type UpsertMcpInput = {
  readonly userId: string;
  readonly platform: string;
  readonly url?: string | null;
  readonly token?: string | null;
  readonly account?: string | null;
  readonly enabled?: boolean;
};

// Connect or switch an account: insert a new row, or update the existing one
// for this (user, platform). Only fields that are provided are overwritten.
export async function upsertMcpConnection(input: UpsertMcpInput): Promise<McpConnection> {
  const platform = input.platform.toLowerCase();
  const existing = await getMcpConnection(input.userId, platform);
  const now = new Date();

  if (existing) {
    const rows = await db
      .update(mcpConnection)
      .set({
        url: input.url === undefined ? existing.url : input.url,
        token: input.token === undefined ? existing.token : input.token,
        account: input.account === undefined ? existing.account : input.account,
        enabled: input.enabled === undefined ? existing.enabled : input.enabled,
        updatedAt: now,
      })
      .where(eq(mcpConnection.id, existing.id))
      .returning();

    return rows[0]!;
  }

  const rows = await db
    .insert(mcpConnection)
    .values({
      id: randomUUID(),
      userId: input.userId,
      platform,
      url: input.url ?? null,
      token: input.token ?? null,
      account: input.account ?? null,
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rows[0]!;
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
  const merged = { ...((existing?.oauth as Record<string, unknown> | null) ?? {}), ...partial };

  await db
    .update(mcpConnection)
    .set({ oauth: merged, updatedAt: new Date() })
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

  return rows[0] ?? null;
}
