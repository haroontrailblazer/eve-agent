import type { McpConnectionRow } from "@/lib/db/mcp";

// What the browser may know about an MCP connection. Built field by field, so a
// new column on the row can never leak to the client by accident.
export type McpConnectionSummary = {
  readonly platform: string;
  readonly account: string | null;
  readonly enabled: boolean;
  readonly hasToken: boolean;
  // Its stored secrets no longer decrypt (the encryption key changed), so it
  // has to be connected again.
  readonly needsReconnect: boolean;
};

export function toMcpConnectionSummary(row: McpConnectionRow): McpConnectionSummary {
  return {
    platform: row.platform,
    account: row.account,
    enabled: row.enabled,
    hasToken: Boolean(row.token),
    needsReconnect: row.secretsUnreadable,
  };
}
