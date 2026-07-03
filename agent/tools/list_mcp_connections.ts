import { defineTool } from "eve/tools";
import { z } from "zod";
import { listMcpConnections } from "@/lib/db/mcp";
import { resolveUserId } from "@/lib/mcp-context";

export default defineTool({
  description:
    "List the current user's MCP connections and which account each platform is connected to. Reads from the database. Use when the user asks which account a platform is on, or to show all connections.",
  inputSchema: z.object({
    platform: z
      .string()
      .optional()
      .describe("Optionally filter to one platform, e.g. 'linkedin'."),
  }),
  async execute(input, ctx) {
    const userId = resolveUserId(ctx);

    if (!userId) {
      return { connections: [], message: "Sign in to view MCP connections.", ok: false };
    }

    const all = await listMcpConnections(userId);
    const platform = input.platform?.toLowerCase();
    const filtered = platform ? all.filter((c) => c.platform === platform) : all;

    return {
      connections: filtered.map((c) => ({
        account: c.account,
        enabled: c.enabled,
        hasToken: Boolean(c.token),
        platform: c.platform,
        url: c.url,
      })),
      ok: true,
    };
  },
});
