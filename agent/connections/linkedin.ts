import { defineMcpClientConnection } from "eve/connections";
import { getMcpConnection } from "@/lib/db/mcp";
import { resolvePrincipalId } from "@/lib/mcp-context";

// The account/token is resolved per-user from the database (see the connect_mcp
// tool and the profile page), falling back to LINKEDIN_MCP_TOKEN. The server URL
// is configured via LINKEDIN_MCP_URL (LinkedIn has no official hosted MCP server).
const url = process.env.LINKEDIN_MCP_URL ?? "http://localhost:3001/linkedin/mcp";

export default defineMcpClientConnection({
  url,
  description:
    "LinkedIn: publish posts and articles to a member profile or organization page, and read post engagement.",
  auth: {
    getToken: async (arg?: unknown) => {
      const principal = (arg as { principal?: unknown } | undefined)?.principal ?? arg;
      const userId = resolvePrincipalId(principal);
      const stored = userId ? await getMcpConnection(userId, "linkedin") : null;
      return { token: stored?.token ?? process.env.LINKEDIN_MCP_TOKEN ?? "" };
    },
  },
});
