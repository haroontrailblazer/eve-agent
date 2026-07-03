import { defineMcpClientConnection } from "eve/connections";
import { getMcpConnection } from "@/lib/db/mcp";
import { resolvePrincipalId } from "@/lib/mcp-context";

// The account/token is resolved per-user from the database (see the connect_mcp
// tool and the profile page), falling back to THREADS_MCP_TOKEN. The server URL
// is configured via THREADS_MCP_URL (Threads has no official hosted MCP server).
const url = process.env.THREADS_MCP_URL ?? "http://localhost:3001/threads/mcp";

export default defineMcpClientConnection({
  url,
  description:
    "Threads (Meta): publish text and media threads, post replies, and read thread insights.",
  auth: {
    getToken: async (arg?: unknown) => {
      const principal = (arg as { principal?: unknown } | undefined)?.principal ?? arg;
      const userId = resolvePrincipalId(principal);
      const stored = userId ? await getMcpConnection(userId, "threads") : null;
      return { token: stored?.token ?? process.env.THREADS_MCP_TOKEN ?? "" };
    },
  },
});
