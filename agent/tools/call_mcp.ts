import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMcpConnection } from "@/lib/db/mcp";
import { callMcpTool, errorMessage, isUnauthorizedError, type McpAuth } from "@/lib/mcp-client";
import { resolveDbUserId } from "@/lib/mcp-context";
import { DbOAuthProvider, getAppOrigin } from "@/lib/mcp-oauth";

export default defineTool({
  description:
    "Call a tool on a connected MCP server. Looks up the server's URL and token from the database, opens a live connection, invokes the named tool with the given arguments, and returns its result. Call list_mcp_tools first to see the available tools and their required arguments.",
  inputSchema: z.object({
    platform: z
      .string()
      .min(1)
      .describe("The MCP platform name that was connected, e.g. 'higgsfield'."),
    tool: z.string().min(1).describe("The tool name to invoke (from list_mcp_tools)."),
    arguments: z
      .record(z.string(), z.unknown())
      .optional()
      .describe("Arguments object for the tool, matching its input schema."),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in." };
    }

    const platform = input.platform.toLowerCase();
    const connection = await getMcpConnection(userId, platform);

    if (!connection?.url) {
      return {
        ok: false,
        message: `No MCP URL saved for ${platform}. Connect it first with its URL.`,
      };
    }

    const auth: McpAuth = connection.token
      ? { token: connection.token }
      : { authProvider: new DbOAuthProvider(userId, platform, getAppOrigin()) };

    try {
      const result = await callMcpTool(connection.url, auth, input.tool, input.arguments ?? {});
      return { ok: true, platform, tool: input.tool, result };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return {
          ok: false,
          message: `${platform} needs authentication — give me its API key/token to connect.`,
        };
      }

      return {
        ok: false,
        message: `Calling ${input.tool} on ${platform} failed: ${errorMessage(error)}`,
      };
    }
  },
});
