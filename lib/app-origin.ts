// The single place that decides which origin harpy runs on. Auth, metadata,
// the MCP OAuth redirect_uri and hosted image urls must all agree, so they all
// call getAppOrigin() instead of reading the environment themselves.

type Env = Readonly<Record<string, string | undefined>>;

const LOCAL_APP_ORIGIN = "http://localhost:3000";
const HAS_SCHEME = /^[a-z][a-z\d+.-]*:\/\//i;

// Normalizes a configured url or bare host to an http(s) origin, or undefined
// when it is empty, unparseable, or not http(s).
export function toOrigin(value: string | undefined): string | undefined {
  const trimmed = value?.trim();

  if (!trimmed) {
    return undefined;
  }

  try {
    const url = new URL(HAS_SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`);

    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : undefined;
  } catch {
    return undefined;
  }
}

// Precedence: BETTER_AUTH_URL, then VERCEL_PROJECT_PRODUCTION_URL, then
// VERCEL_URL, then localhost. Empty and invalid values are skipped.
export function getAppOrigin(env: Env = process.env): string {
  return (
    toOrigin(env.BETTER_AUTH_URL) ??
    toOrigin(env.VERCEL_PROJECT_PRODUCTION_URL) ??
    toOrigin(env.VERCEL_URL) ??
    LOCAL_APP_ORIGIN
  );
}

// Hosts (with port, when not default) of every configured app url, for
// Better Auth's allowed hosts.
export function getConfiguredAppHosts(env: Env = process.env): string[] {
  const hosts = [env.BETTER_AUTH_URL, env.VERCEL_PROJECT_PRODUCTION_URL, env.VERCEL_URL]
    .map(toOrigin)
    .filter((origin): origin is string => origin !== undefined)
    .map((origin) => new URL(origin).host);

  return [...new Set(hosts)];
}

export function appUrl(path: string, env: Env = process.env): string {
  return `${getAppOrigin(env)}/${path.replace(/^\/+/, "")}`;
}
