import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMcpConnection } from "@/lib/db/mcp";
import { errorMessage, isUnauthorizedError, listMcpTools, type McpAuth } from "@/lib/mcp-client";
import { resolveDbUserId } from "@/lib/mcp-context";
import { DbOAuthProvider, getAppOrigin } from "@/lib/mcp-oauth";

export default defineTool({
  description:
    "List the tools available on an MCP server the user has connected (via connect_mcp), including each tool's description and input schema. Use this before call_mcp so you know what to call and with which arguments.",
  inputSchema: z.object({
    platform: z
      .string()
      .min(1)
      .describe("The MCP platform name that was connected, e.g. 'higgsfield'."),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, tools: [], message: "You need to be signed in." };
    }

    const platform = input.platform.toLowerCase();
    const connection = await getMcpConnection(userId, platform);

    if (!connection?.url) {
      return { ok: false, tools: [], message: `No MCP URL saved for ${platform}. Connect it first.` };
    }

    const auth: McpAuth = connection.token
      ? { token: connection.token }
      : { authProvider: new DbOAuthProvider(userId, platform, getAppOrigin()) };

    try {
      const tools = await listMcpTools(connection.url, auth);
      return { ok: true, platform, tools };
    } catch (error) {
      if (isUnauthorizedError(error)) {
        return {
          ok: false,
          tools: [],
          message: `${platform} needs authentication — give me its API key/token to connect.`,
        };
      }

      return {
        ok: false,
        tools: [],
        message: `Couldn't list tools for ${platform}: ${errorMessage(error)}`,
      };
    }
  },
});
