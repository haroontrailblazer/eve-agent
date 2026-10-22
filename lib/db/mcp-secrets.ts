import { decryptSecret, encryptSecret, isSecretBox, SecretBoxError } from "@/lib/crypto/secret-box";

// mcp_connection.oauth holds the dynamic client registration, PKCE verifier and
// tokens for an OAuth MCP server. It is stored as { box } (the JSON, encrypted)
// so the jsonb column never carries a token. Rows written before encryption
// hold the bare object; openOauth still reads them.

type Env = Readonly<Record<string, string | undefined>>;

export type SealedOauth = { readonly box: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isSealedOauth(value: unknown): value is SealedOauth {
  if (!isRecord(value)) {
    return false;
  }

  const keys = Object.keys(value);

  return keys.length === 1 && keys[0] === "box" && typeof value.box === "string" && isSecretBox(value.box);
}

export function sealOauth(value: Record<string, unknown> | null, env?: Env): SealedOauth | null {
  if (value === null) {
    return null;
  }

  return { box: encryptSecret(JSON.stringify(value), env) };
}

export function openOauth(value: unknown, env?: Env): Record<string, unknown> | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (isSealedOauth(value)) {
    let parsed: unknown;

    try {
      parsed = JSON.parse(decryptSecret(value.box, env));
    } catch (error) {
      if (error instanceof SecretBoxError) {
        throw error;
      }

      throw new SecretBoxError("Sealed OAuth state is not valid JSON.");
    }

    if (!isRecord(parsed)) {
      throw new SecretBoxError("Sealed OAuth state is not an object.");
    }

    return parsed;
  }

  return isRecord(value) ? value : null;
}
