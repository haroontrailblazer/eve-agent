import { getAppOrigin } from "@/lib/app-origin";
import { getMcpByOauthState, setMcpOauthState, upsertMcpConnection } from "@/lib/db/mcp";
import { errorMessage, finishMcpAuth } from "@/lib/mcp-client";
import { DbOAuthProvider } from "@/lib/mcp-oauth";
import { renderCallbackPage } from "@/lib/oauth-callback-page";

const MAX_ERROR_LENGTH = 200;

// renderCallbackPage escapes everything it is given, so values from the query
// string, the connection row and thrown errors are passed in raw.
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return renderCallbackPage({
      title: "Authorization was declined",
      body: `The server reported: ${oauthError.slice(0, MAX_ERROR_LENGTH)}.`,
      ok: false,
    });
  }

  if (!code || !state) {
    return renderCallbackPage({
      title: "Missing authorization code",
      body: "This callback is missing its code or state.",
      ok: false,
    });
  }

  const connection = await getMcpByOauthState(state);

  if (!connection?.url) {
    return renderCallbackPage({
      title: "Couldn't match this sign-in",
      body: "No pending MCP connection matched this request. Try connecting again from the chat.",
      ok: false,
    });
  }

  try {
    const provider = new DbOAuthProvider(connection.userId, connection.platform, getAppOrigin());
    await finishMcpAuth(connection.url, provider, code);
    await setMcpOauthState(connection.userId, connection.platform, null);
    await upsertMcpConnection({
      enabled: true,
      platform: connection.platform,
      userId: connection.userId,
    });

    return renderCallbackPage({
      title: `Connected to ${connection.platform}`,
      body: `You're signed in and the connection is ready. Close this tab and return to harpy, then ask it to use ${connection.platform}.`,
      ok: true,
    });
  } catch (error) {
    return renderCallbackPage({
      title: "Couldn't finish connecting",
      body: errorMessage(error),
      ok: false,
    });
  }
}
