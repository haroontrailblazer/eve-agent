import { defineMcpClientConnection } from "eve/connections";

// LinkedIn has no official hosted MCP server, so point this at an MCP server you
// run or host yourself by setting LINKEDIN_MCP_URL. If that server expects a
// bearer token, set LINKEDIN_MCP_TOKEN too. Until LINKEDIN_MCP_URL is set the
// connection stays inert (the localhost default is only reachable during local dev).
const url = process.env.LINKEDIN_MCP_URL ?? "http://localhost:3001/linkedin/mcp";
const token = process.env.LINKEDIN_MCP_TOKEN;

export default defineMcpClientConnection({
  url,
  description:
    "LinkedIn: publish posts and articles to a member profile or organization page, and read post engagement.",
  auth: token ? { getToken: async () => ({ token }) } : undefined,
});
