import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertMcpConnection } from "@/lib/db/mcp";
import { errorMessage, isUnauthorizedError, listMcpTools, type McpAuth } from "@/lib/mcp-client";
import { resolveDbUserId } from "@/lib/mcp-context";
import { DbOAuthProvider, getAppOrigin } from "@/lib/mcp-oauth";

export default defineTool({
  description:
    "Connect an MCP server for the current user. Give a `url` and this opens a live connection, lists the server's tools, and saves it. Works for public servers (no auth), token servers (pass `token`), and OAuth servers (no token needed — the tool returns a sign-in link the user opens to authorize). Also switches a platform's account. Reports the real result: connected with the tool list, a sign-in link to open, or the actual error. When it returns a sign-in URL, show that link to the user and tell them to open it, then check the connection again.",
  inputSchema: z.object({
    platform: z
      .string()
      .min(1)
      .describe("A short lowercase name for this MCP, e.g. 'higgsfield', 'deepwiki'."),
    url: z
      .string()
      .optional()
      .describe("The MCP server URL, e.g. 'https://mcp.higgsfield.ai/mcp'."),
    token: z
      .string()
      .optional()
      .describe("Bearer token / API key, only if the server uses static-token auth. Omit for public or OAuth servers."),
    account: z.string().optional().describe("Optional account label."),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to manage MCP connections." };
    }

    const platform = input.platform.toLowerCase();

    let connection;
    try {
      connection = await upsertMcpConnection({
        account: input.account,
        platform,
        token: input.token,
        url: input.url,
        userId,
      });
    } catch (error) {
      return { ok: false, message: `Couldn't save ${platform}: ${errorMessage(error)}` };
    }

    if (!connection.url) {
      return {
        ok: true,
        platform,
        message: `Saved ${platform}. Give me the MCP server URL and I'll open the connection.`,
      };
    }

    const provider = connection.token
      ? undefined
      : new DbOAuthProvider(userId, platform, getAppOrigin());
    const auth: McpAuth = connection.token ? { token: connection.token } : { authProvider: provider };

    try {
      const tools = await listMcpTools(connection.url, auth);
      await upsertMcpConnection({ enabled: true, platform, userId });
      const names = tools.map((tool) => tool.name);

      return {
        ok: true,
        platform,
        url: connection.url,
        toolCount: tools.length,
        tools: names.slice(0, 30),
        message: `Connected to ${platform} at ${connection.url}. ${tools.length} tool${
          tools.length === 1 ? "" : "s"
        } available: ${names.slice(0, 12).join(", ")}${names.length > 12 ? ", …" : ""}.`,
      };
    } catch (error) {
      await upsertMcpConnection({ enabled: false, platform, userId });

      // OAuth server: the provider captured a sign-in URL to hand the user.
      if (provider?.authorizationUrl) {
        return {
          ok: false,
          needsSignIn: true,
          platform,
          signInUrl: provider.authorizationUrl,
          message: `${platform} uses OAuth. Open this link to sign in and authorize, then ask me to check the ${platform} connection again:\n${provider.authorizationUrl}`,
        };
      }

      if (isUnauthorizedError(error)) {
        return {
          ok: false,
          needsAuth: true,
          platform,
          message: `${platform} needs authentication. If it uses an API key, give it to me; if it uses OAuth, tell me and I'll produce a sign-in link.`,
        };
      }

      return {
        ok: false,
        platform,
        message: `Saved ${platform}, but I couldn't reach ${connection.url}: ${errorMessage(error)}`,
      };
    }
  },
});
