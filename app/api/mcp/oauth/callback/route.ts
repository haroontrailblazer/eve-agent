import { getMcpByOauthState, setMcpOauthState, upsertMcpConnection } from "@/lib/db/mcp";
import { errorMessage, finishMcpAuth } from "@/lib/mcp-client";
import { DbOAuthProvider, getAppOrigin } from "@/lib/mcp-oauth";

function page(title: string, body: string, ok = true): Response {
  const html = `<!doctype html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><title>${title}</title></head><body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0b0d;color:#edeff2;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"><div style="max-width:26rem;padding:2rem;text-align:center"><div style="font-size:2.2rem;line-height:1;margin-bottom:1rem">${ok ? "✓" : "⚠"}</div><h1 style="font-size:1.15rem;margin:0 0 .5rem">${title}</h1><p style="color:#9aa1ad;font-size:.9rem;line-height:1.55;margin:0">${body}</p></div></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  if (oauthError) {
    return page("Authorization was declined", `The server reported: ${oauthError}.`, false);
  }

  if (!code || !state) {
    return page("Missing authorization code", "This callback is missing its code or state.", false);
  }

  const connection = await getMcpByOauthState(state);

  if (!connection?.url) {
    return page(
      "Couldn't match this sign-in",
      "No pending MCP connection matched this request. Try connecting again from the chat.",
      false,
    );
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

    return page(
      `Connected to ${connection.platform}`,
      "You're signed in and the connection is ready. Close this tab and return to harpy — ask it to use " +
        connection.platform +
        ".",
    );
  } catch (error) {
    return page("Couldn't finish connecting", errorMessage(error), false);
  }
}
