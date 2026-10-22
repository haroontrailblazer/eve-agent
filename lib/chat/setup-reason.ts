import type { SetupStatus } from "./types";

// Why chat cannot start yet, in the order the setup steps have to be done.
export function getSetupDisabledReason(status: SetupStatus): string | undefined {
  if (!status.databaseConfigured) {
    return "Connect Neon Postgres before chatting.";
  }

  if (!status.databaseSchemaReady) {
    return "Run database migrations: vercel env run -e production -- pnpm db:migrate.";
  }

  if (!status.authReady) {
    const missing = status.missing.length ? ` Missing: ${status.missing.join(", ")}.` : "";

    return `Finish auth setup before chatting.${missing}`;
  }

  if (!status.rateLimitReady) {
    return "Provision Upstash Redis before chatting.";
  }

  return undefined;
}
