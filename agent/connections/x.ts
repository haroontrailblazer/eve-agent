import { defineMcpClientConnection } from "eve/connections";

// X (Twitter) has no official hosted MCP server, so point this at an MCP server
// you run or host yourself by setting X_MCP_URL. If that server expects a bearer
// token, set X_MCP_TOKEN too. Until X_MCP_URL is set the connection stays inert
// (the localhost default is only reachable during local dev).
const url = process.env.X_MCP_URL ?? "http://localhost:3001/x/mcp";
const token = process.env.X_MCP_TOKEN;

export default defineMcpClientConnection({
  url,
  description:
    "X (Twitter): publish posts and threads, read mentions and replies, and look up profiles and posts.",
  auth: token ? { getToken: async () => ({ token }) } : undefined,
});
