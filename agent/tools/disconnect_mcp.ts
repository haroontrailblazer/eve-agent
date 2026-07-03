import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteMcpConnection } from "@/lib/db/mcp";
import { resolveUserId } from "@/lib/mcp-context";

export default defineTool({
  description:
    "Disconnect (remove) an MCP integration for the current user. Deletes the stored connection from the database. Use when the user asks to disconnect or remove a platform.",
  inputSchema: z.object({
    platform: z
      .string()
      .min(1)
      .describe("The MCP platform to disconnect, e.g. 'linkedin'."),
  }),
  async execute(input, ctx) {
    const userId = resolveUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to manage MCP connections." };
    }

    const removed = await deleteMcpConnection(userId, input.platform);
    const platform = input.platform.toLowerCase();

    return {
      message: removed
        ? `Disconnected ${platform} and removed it from the database.`
        : `There was no ${platform} connection to disconnect.`,
      ok: removed,
    };
  },
});
