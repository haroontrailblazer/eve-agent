import { defineMcpClientConnection } from "eve/connections";

// DeepWiki is a public MCP server — no API key or token required. It's the easy
// example of "connect an MCP with no auth": ask harpy about any public GitHub
// repo's docs and it can query DeepWiki directly.
export default defineMcpClientConnection({
  url: "https://mcp.deepwiki.com/mcp",
  description:
    "DeepWiki: ask questions about any public GitHub repository's documentation and code, and read its structure. No authentication required.",
});
