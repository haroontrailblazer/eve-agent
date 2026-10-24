import type { McpConnection } from "@/lib/db/schema";

// What the browser may know about an MCP connection. Built field by field, so a
// new column on the row can never leak to the client by accident.
export type McpConnectionSummary = {
  readonly platform: string;
  readonly account: string | null;
  readonly enabled: boolean;
  readonly hasToken: boolean;
};

export function toMcpConnectionSummary(row: McpConnection): McpConnectionSummary {
  return {
    platform: row.platform,
    account: row.account,
    enabled: row.enabled,
    hasToken: Boolean(row.token),
  };
}
