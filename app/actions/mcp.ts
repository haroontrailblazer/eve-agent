"use server";

import { deleteMcpConnection } from "@/lib/db/mcp";
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
