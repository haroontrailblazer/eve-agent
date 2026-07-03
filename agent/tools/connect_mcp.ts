import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertMcpConnection } from "@/lib/db/mcp";
import { resolveDbUserId } from "@/lib/mcp-context";

export default defineTool({
  description:
    "Connect an MCP integration for the current user, or switch which account it uses. Stores the connection in the database (platform, account, url, token). Use for platforms like 'linkedin', 'x', 'threads', 'deepwiki', or any MCP platform name. Public MCP servers (e.g. deepwiki) need no token. Call this whenever the user asks to connect a platform or change its account. Returns the account it is now connected to.",
  inputSchema: z.object({
    platform: z
      .string()
      .min(1)
      .describe("The MCP platform, lowercase, e.g. 'linkedin', 'x', 'threads', 'deepwiki'."),
    account: z
      .string()
      .optional()
      .describe("The account to connect — a handle, email, or org id. Omit for public/no-auth servers."),
    url: z.string().optional().describe("Optional MCP server URL for this platform."),
    token: z.string().optional().describe("Optional bearer token / credential. Omit for public servers."),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to manage MCP connections." };
    }

    try {
      const connection = await upsertMcpConnection({
        account: input.account,
        enabled: true,
        platform: input.platform,
        token: input.token,
        url: input.url,
        userId,
      });

      return {
        account: connection.account,
        message: connection.account
          ? `Connected ${connection.platform} to account "${connection.account}". This is saved in your database.`
          : `Connected ${connection.platform} and saved it in your database. No account label is set — tell me the account if you want one.`,
        ok: true,
        platform: connection.platform,
      };
    } catch (error) {
      return {
        message: `Couldn't save the ${input.platform.toLowerCase()} connection: ${
          error instanceof Error ? error.message : "database error"
        }`,
        ok: false,
      };
    }
  },
});
