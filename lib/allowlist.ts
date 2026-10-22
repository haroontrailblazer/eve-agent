// Who may sign in to harpy. The owner (HARPY_OWNER_EMAIL) is always allowed;
// HARPY_ALLOWED_EMAILS adds more people as a comma-separated list. An empty
// list allows nobody, so a missing env var fails closed.

type Env = Readonly<Record<string, string | undefined>>;

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();

  return normalized ? normalized : null;
}

export function getOwnerEmail(env: Env = process.env): string | null {
  return normalizeEmail(env.HARPY_OWNER_EMAIL);
}

export function getAllowedEmails(env: Env = process.env): readonly string[] {
  const owner = getOwnerEmail(env);
  const others = (env.HARPY_ALLOWED_EMAILS ?? "")
    .split(",")
    .map(normalizeEmail)
    .filter((email): email is string => email !== null);

  return [...new Set([...(owner ? [owner] : []), ...others])];
}

export function isEmailAllowed(email: string | null | undefined, env: Env = process.env): boolean {
  const normalized = normalizeEmail(email);

  return normalized !== null && getAllowedEmails(env).includes(normalized);
}
