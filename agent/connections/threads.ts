import { defineMcpClientConnection } from "eve/connections";

// Threads (Meta) has no official hosted MCP server, so point this at an MCP
// server you run or host yourself by setting THREADS_MCP_URL. If that server
// expects a bearer token, set THREADS_MCP_TOKEN too. Until THREADS_MCP_URL is set
// the connection stays inert (the localhost default is only reachable during local dev).
const url = process.env.THREADS_MCP_URL ?? "http://localhost:3001/threads/mcp";
const token = process.env.THREADS_MCP_TOKEN;

export default defineMcpClientConnection({
  url,
  description:
    "Threads (Meta): publish text and media threads, post replies, and read thread insights.",
  auth: token ? { getToken: async () => ({ token }) } : undefined,
});
