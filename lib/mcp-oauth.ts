import { randomUUID } from "node:crypto";
import type {
  OAuthClientInformation,
  OAuthClientInformationFull,
  OAuthClientMetadata,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import { getMcpConnection, patchMcpOauth, setMcpOauthState } from "@/lib/db/mcp";

// The origin harpy runs on, used to build the OAuth callback URL. Must be stable
// across the connect step and the callback step so the redirect_uri matches.
export function getAppOrigin(): string {
  const configured =
    process.env.BETTER_AUTH_URL ??
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.VERCEL_PROJECT_PRODUCTION_URL ??
    process.env.VERCEL_URL;

  if (!configured) {
    return "http://localhost:3000";
  }

  return configured.startsWith("http") ? configured : `https://${configured}`;
}

export function mcpCallbackUrl(origin: string): string {
  return `${origin.replace(/\/$/, "")}/api/mcp/oauth/callback`;
}

// An OAuthClientProvider whose client registration, PKCE verifier, and tokens
// live in the mcp_connection row for this (user, platform). The SDK drives
// discovery, dynamic client registration, PKCE, and token exchange through it.
export class DbOAuthProvider implements OAuthClientProvider {
  public authorizationUrl: string | null = null;

  constructor(
    private readonly userId: string,
    private readonly platform: string,
    private readonly origin: string,
  ) {}

  get redirectUrl(): string {
    return mcpCallbackUrl(this.origin);
  }

  get clientMetadata(): OAuthClientMetadata {
    return {
      client_name: "harpy",
      grant_types: ["authorization_code", "refresh_token"],
      redirect_uris: [this.redirectUrl],
      response_types: ["code"],
      scope: "openid email offline_access",
      token_endpoint_auth_method: "none",
    };
  }

  async state(): Promise<string> {
    const value = randomUUID();
    await setMcpOauthState(this.userId, this.platform, value);
    return value;
  }

  async clientInformation(): Promise<OAuthClientInformation | undefined> {
    const oauth = await this.readOauth();
    return oauth?.client as OAuthClientInformation | undefined;
  }

  async saveClientInformation(info: OAuthClientInformationFull): Promise<void> {
    await patchMcpOauth(this.userId, this.platform, { client: info });
  }

  async tokens(): Promise<OAuthTokens | undefined> {
    const oauth = await this.readOauth();
    return oauth?.tokens as OAuthTokens | undefined;
  }

  async saveTokens(tokens: OAuthTokens): Promise<void> {
    await patchMcpOauth(this.userId, this.platform, { tokens });
  }

  async saveCodeVerifier(verifier: string): Promise<void> {
    await patchMcpOauth(this.userId, this.platform, { verifier });
  }

  async codeVerifier(): Promise<string> {
    const oauth = await this.readOauth();
    return (oauth?.verifier as string | undefined) ?? "";
  }

  async redirectToAuthorization(authorizationUrl: URL): Promise<void> {
    this.authorizationUrl = authorizationUrl.toString();
  }

  private async readOauth(): Promise<Record<string, unknown> | null> {
    const connection = await getMcpConnection(this.userId, this.platform);
    return (connection?.oauth as Record<string, unknown> | null) ?? null;
  }
}
