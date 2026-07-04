import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// A real MCP client over Streamable HTTP. Supports a static bearer token, an
// OAuth provider (for servers that sign in), or neither (public servers) — so
// the connect/call tools actually reach the server, verify it, and invoke tools.

export type McpAuth = {
  readonly token?: string | null;
  readonly authProvider?: OAuthClientProvider;
};

export type McpToolInfo = {
  readonly name: string;
  readonly description?: string;
  readonly inputSchema?: unknown;
};

function makeTransport(url: string, auth: McpAuth = {}) {
  return new StreamableHTTPClientTransport(new URL(url), {
    authProvider: auth.authProvider,
    requestInit: auth.token
      ? { headers: { Authorization: `Bearer ${auth.token}` } }
      : undefined,
  });
}

async function withClient<T>(
  url: string,
  auth: McpAuth,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const client = new Client({ name: "harpy", version: "1.0.0" });
  const transport = makeTransport(url, auth);

  await client.connect(transport);

  try {
    return await fn(client);
  } finally {
    await client.close().catch(() => {});
  }
}

export async function listMcpTools(url: string, auth: McpAuth = {}): Promise<McpToolInfo[]> {
  return withClient(url, auth, async (client) => {
    const result = await client.listTools();
    return result.tools.map((tool) => ({
      description: tool.description,
      inputSchema: tool.inputSchema,
      name: tool.name,
    }));
  });
}

export async function callMcpTool(
  url: string,
  auth: McpAuth,
  name: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  return withClient(url, auth, (client) => client.callTool({ arguments: args, name }));
}

// Complete an OAuth flow: exchange the authorization code for tokens (the
// provider persists them). Used by the callback route.
export async function finishMcpAuth(
  url: string,
  authProvider: OAuthClientProvider,
  authorizationCode: string,
): Promise<void> {
  const transport = new StreamableHTTPClientTransport(new URL(url), { authProvider });
  await transport.finishAuth(authorizationCode);
  await transport.close().catch(() => {});
}

export function isUnauthorizedError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unauthor|forbidden|\b401\b|\b403\b/i.test(message);
}

export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
