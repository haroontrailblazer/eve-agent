import { describe, expect, it } from "vitest";
import type { SetupStatus } from "./types";
import { getSetupDisabledReason } from "./setup-reason";

const ready: SetupStatus = {
  appReady: true,
  authReady: true,
  databaseConfigured: true,
  databaseReady: true,
  databaseSchemaReady: true,
  mediaReady: true,
  missing: [],
  rateLimitReady: true,
  secretsReady: true,
};

describe("getSetupDisabledReason", () => {
  it("returns undefined when everything is ready", () => {
    expect(getSetupDisabledReason(ready)).toBeUndefined();
  });

  it("asks for Neon first", () => {
    expect(
      getSetupDisabledReason({
        ...ready,
        authReady: false,
        databaseConfigured: false,
        databaseSchemaReady: false,
        rateLimitReady: false,
      }),
    ).toBe("Connect Neon Postgres before chatting.");
  });

  it("asks for migrations second", () => {
    expect(
      getSetupDisabledReason({
        ...ready,
        authReady: false,
        databaseSchemaReady: false,
        rateLimitReady: false,
      }),
    ).toBe("Run database migrations: vercel env run -e production -- pnpm db:migrate.");
  });

  it("lists the missing auth variables third", () => {
    expect(
      getSetupDisabledReason({
        ...ready,
        authReady: false,
        missing: ["BETTER_AUTH_SECRET"],
        rateLimitReady: false,
      }),
    ).toBe("Finish auth setup before chatting. Missing: BETTER_AUTH_SECRET.");
  });

  it("joins several missing auth variables", () => {
    expect(
      getSetupDisabledReason({
        ...ready,
        authReady: false,
        missing: ["BETTER_AUTH_SECRET", "BETTER_AUTH_URL"],
      }),
    ).toBe("Finish auth setup before chatting. Missing: BETTER_AUTH_SECRET, BETTER_AUTH_URL.");
  });

  it("omits the missing list when it is empty", () => {
    expect(getSetupDisabledReason({ ...ready, authReady: false })).toBe(
      "Finish auth setup before chatting.",
    );
  });

  it("asks for Upstash fourth", () => {
    expect(
      getSetupDisabledReason({ ...ready, rateLimitReady: false, secretsReady: false }),
    ).toBe("Provision Upstash Redis before chatting.");
  });

  it("asks for the encryption key last", () => {
    expect(getSetupDisabledReason({ ...ready, secretsReady: false })).toBe(
      "Set SOCIAL_TOKEN_ENCRYPTION_KEY before chatting.",
    );
  });
});
