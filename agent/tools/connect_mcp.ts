import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertMcpConnection } from "@/lib/db/mcp";
import { resolveUserId } from "@/lib/mcp-context";

export default defineTool({
  description:
    "Connect an MCP integration for the current user, or switch which account it uses. Stores the connection in the database (platform, account, url, token). Use for platforms like 'linkedin', 'x', 'threads', or any MCP platform name. Call this whenever the user asks to connect a platform or change its account. Returns the account it is now connected to.",
  inputSchema: z.object({
    platform: z
      .string()
      .min(1)
      .describe("The MCP platform, lowercase, e.g. 'linkedin', 'x', 'threads'."),
    account: z
      .string()
      .optional()
      .describe("The account to connect — a handle, email, or org id (e.g. '@harpy' or 'jane@acme.com')."),
    url: z.string().optional().describe("Optional MCP server URL for this platform."),
    token: z.string().optional().describe("Optional bearer token / credential for the account."),
  }),
  async execute(input, ctx) {
    const userId = resolveUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to manage MCP connections." };
    }

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
        ? `Connected ${connection.platform} to account "${connection.account}". This is saved in the database.`
        : `Connected ${connection.platform}. No account is set yet — tell me which account to use and I'll update it.`,
      ok: true,
      platform: connection.platform,
    };
  },
});
