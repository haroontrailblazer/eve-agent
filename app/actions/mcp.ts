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

// The signed-in user's MCP connections for the Channels page. Rows are mapped
// to summaries here, so tokens and OAuth data never leave the server.
export async function listMcpConnectionsAction(): Promise<readonly McpConnectionSummary[]> {
  const viewer = await getServerViewer();

  if (!viewer) {
    return [];
  }

  try {
    return (await listMcpConnections(viewer.id)).map(toMcpConnectionSummary);
  } catch {
    return [];
  }
}
