import { defineMcpClientConnection } from "eve/connections";
import { getMcpConnection } from "@/lib/db/mcp";
import { resolvePrincipalId } from "@/lib/mcp-context";

// The account/token is resolved per-user from the database (see the connect_mcp
// tool and the profile page), falling back to X_MCP_TOKEN. The server URL is
// configured via X_MCP_URL (X has no official hosted MCP server).
const url = process.env.X_MCP_URL ?? "http://localhost:3001/x/mcp";

export default defineMcpClientConnection({
  url,
  description:
    "X (Twitter): publish posts and threads, read mentions and replies, and look up profiles and posts.",
  auth: {
    getToken: async (arg?: unknown) => {
      const principal = (arg as { principal?: unknown } | undefined)?.principal ?? arg;
      const userId = resolvePrincipalId(principal);
      const stored = userId ? await getMcpConnection(userId, "x") : null;
      return { token: stored?.token ?? process.env.X_MCP_TOKEN ?? "" };
    },
  },
});
