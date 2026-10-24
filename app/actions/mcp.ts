"use server";

import { deleteMcpConnection, listMcpConnections } from "@/lib/db/mcp";
import { toMcpConnectionSummary, type McpConnectionSummary } from "@/lib/mcp-summary";
import { getServerViewer } from "@/lib/session";

export async function disconnectMcpAction(
  platform: string,
): Promise<{ readonly ok: boolean }> {
  const viewer = await getServerViewer();

  if (!viewer) {
    return { ok: false };
  }

  const removed = await deleteMcpConnection(viewer.id, platform);
  return { ok: removed };
}

export type McpConnectionsResult =
  | { readonly ok: true; readonly connections: readonly McpConnectionSummary[] }
  | { readonly ok: false };

// The signed-in user's MCP connections for the Channels page. Rows are mapped
// to summaries here, so tokens and OAuth data never leave the server. A failed
// read is reported as a failure, never as an empty list.
export async function listMcpConnectionsAction(): Promise<McpConnectionsResult> {
  const viewer = await getServerViewer();

  if (!viewer) {
    return { connections: [], ok: true };
  }

  try {
    return {
      connections: (await listMcpConnections(viewer.id)).map(toMcpConnectionSummary),
      ok: true,
    };
  } catch (error) {
    console.error("Could not list MCP connections", error);
    return { ok: false };
  }
}
