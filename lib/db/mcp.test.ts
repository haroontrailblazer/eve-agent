import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, isSecretBox, SecretBoxError } from "@/lib/crypto/secret-box";
import { sealOauth } from "@/lib/db/mcp-secrets";
import type { McpConnection } from "@/lib/db/schema";

// A recording stand-in for the drizzle client: selects resolve to `selectRows`,
// and every insert and update is captured so the tests can read what would have
// been sent to Postgres. When `existingRow` is set, an upsert hits the conflict
// and returns that row with the conflict update applied, as Postgres would.
const fake = vi.hoisted(() => {
  const state = {
    existingRow: null as Record<string, unknown> | null,
    inserts: [] as { conflict: unknown; values: Record<string, unknown> }[],
    selectRows: [] as unknown[],
    updates: [] as { set: Record<string, unknown>; where: unknown }[],
  };

  class Query implements PromiseLike<unknown[]> {
    constructor(private readonly resolve: () => unknown[]) {}

    where(): this {
      return this;
    }

    orderBy(): this {
      return this;
    }

    limit(): this {
      return this;
    }

    returning(): Promise<unknown[]> {
      return Promise.resolve(this.resolve());
    }

    then<T, U>(
      onFulfilled?: (rows: unknown[]) => T | PromiseLike<T>,
      onRejected?: (reason: unknown) => U | PromiseLike<U>,
    ): Promise<T | U> {
      return Promise.resolve(this.resolve()).then(onFulfilled, onRejected);
    }
  }

  const db = {
    insert: () => ({
      values: (values: Record<string, unknown>) => ({
        onConflictDoUpdate: (conflict: { set: Record<string, unknown> }) => {
          state.inserts.push({ conflict, values });

          return new Query(() => [
            state.existingRow
              ? { ...state.existingRow, ...conflict.set }
              : { oauth: null, oauthState: null, ...values },
          ]);
        },
      }),
    }),
    select: () => ({ from: () => new Query(() => state.selectRows) }),
    update: () => ({
      set: (set: Record<string, unknown>) => ({
        where: (where: unknown) => {
          state.updates.push({ set, where });

          return new Query(() => []);
        },
      }),
    }),
  };

  return { db, state };
});

vi.mock("@/lib/db/client", () => ({ db: fake.db }));

import {
  getMcpByOauthState,
  getMcpConnection,
  listMcpConnections,
  patchMcpOauth,
  setMcpOauthState,
  upsertMcpConnection,
} from "@/lib/db/mcp";

const KEY = Buffer.alloc(32, 7).toString("base64");
// A key the rows were sealed with before it was rotated or set wrong.
const OTHER = { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };
const dialect = new PgDialect();

function render(condition: unknown) {
  const { params, sql } = dialect.sqlToQuery(condition as SQL);

  return { params, sql };
}

function row(overrides: Partial<McpConnection> = {}): McpConnection {
  return {
    account: null,
    createdAt: new Date("2026-01-01"),
    enabled: true,
    id: "row-1",
    oauth: null,
    oauthState: null,
    platform: "notion",
    token: null,
    updatedAt: new Date("2026-01-01"),
    url: "https://mcp.example/mcp",
    userId: "user-1",
    ...overrides,
  };
}

beforeEach(() => {
  fake.state.existingRow = null;
  fake.state.inserts.length = 0;
  fake.state.updates.length = 0;
  fake.state.selectRows = [];
  vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", KEY);
});

describe("upsertMcpConnection", () => {
  it("stores the token encrypted and returns it decrypted", async () => {
    const connection = await upsertMcpConnection({
      platform: "Notion",
      token: "secret-token",
      url: "https://mcp.example/mcp",
      userId: "user-1",
    });
    const [insert] = fake.state.inserts;

    expect(insert).toBeDefined();
    expect(isSecretBox(insert!.values.token as string)).toBe(true);
    expect(JSON.stringify(insert!.values)).not.toContain("secret-token");
    expect(decryptSecret(insert!.values.token as string)).toBe("secret-token");
    expect(insert!.values.platform).toBe("notion");
    expect(connection.token).toBe("secret-token");
  });

  it("is one atomic insert that updates on the (user, platform) conflict", async () => {
    await upsertMcpConnection({ platform: "notion", token: "t", userId: "user-1" });

    const conflict = fake.state.inserts[0]!.conflict as { target: { name: string }[] };

    expect(conflict.target.map((column) => column.name)).toEqual(["user_id", "platform"]);
    expect(fake.state.updates).toHaveLength(0);
  });

  it("only overwrites the fields that were provided on conflict", async () => {
    await upsertMcpConnection({ enabled: true, platform: "notion", userId: "user-1" });

    const conflict = fake.state.inserts[0]!.conflict as { set: Record<string, unknown> };

    expect(Object.keys(conflict.set).sort()).toEqual(["enabled", "updatedAt"]);
  });

  it("encrypts the token in the conflict update as well", async () => {
    await upsertMcpConnection({ platform: "notion", token: "rotated", userId: "user-1" });

    const conflict = fake.state.inserts[0]!.conflict as { set: Record<string, unknown> };

    expect(isSecretBox(conflict.set.token as string)).toBe(true);
    expect(decryptSecret(conflict.set.token as string)).toBe("rotated");
  });

  it("clears the token with null without encrypting anything", async () => {
    await upsertMcpConnection({ platform: "notion", token: null, userId: "user-1" });

    const conflict = fake.state.inserts[0]!.conflict as { set: Record<string, unknown> };

    expect(conflict.set.token).toBeNull();
  });

  it("refuses to store a token when no key is configured", async () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "");

    await expect(
      upsertMcpConnection({ platform: "notion", token: "secret-token", userId: "user-1" }),
    ).rejects.toThrow(SecretBoxError);
    expect(fake.state.inserts).toHaveLength(0);
  });

  it("reconnects over a row sealed with another key and clears its unreadable oauth state", async () => {
    const staleOauth = sealOauth({ tokens: { access_token: "old-access" } }, OTHER);

    fake.state.existingRow = row({
      oauth: staleOauth,
      token: encryptSecret("old-token", OTHER),
    });

    const connection = await upsertMcpConnection({
      platform: "notion",
      token: "fresh-token",
      url: "https://mcp.example/mcp",
      userId: "user-1",
    });

    expect(connection.token).toBe("fresh-token");
    expect(connection.oauth).toBeNull();
    expect(connection.secretsUnreadable).toBe(false);

    // The unreadable oauth state is overwritten with null, compare-and-set on
    // the exact sealed value, and never read.
    expect(fake.state.updates).toHaveLength(1);

    const [update] = fake.state.updates;

    expect(update!.set).toEqual({ oauth: null });

    const { params, sql } = render(update!.where);

    expect(sql).toBe('("mcp_connection"."id" = $1 and "mcp_connection"."oauth" = $2::jsonb)');
    expect(params).toEqual(["row-1", JSON.stringify(staleOauth)]);
  });

  it("clears an unreadable token when a reconnect brings no token of its own", async () => {
    const staleToken = encryptSecret("old-token", OTHER);

    fake.state.existingRow = row({ token: staleToken });

    const connection = await upsertMcpConnection({
      platform: "notion",
      url: "https://mcp.example/mcp",
      userId: "user-1",
    });

    expect(connection.token).toBeNull();
    expect(connection.secretsUnreadable).toBe(false);
    expect(fake.state.updates).toHaveLength(1);
    expect(fake.state.updates[0]!.set).toEqual({ token: null });
    expect(render(fake.state.updates[0]!.where)).toEqual({
      params: ["row-1", staleToken],
      sql: '("mcp_connection"."id" = $1 and "mcp_connection"."token" = $2)',
    });
  });

  it("leaves unreadable secrets in place when no key is configured at all", async () => {
    fake.state.existingRow = row({ token: encryptSecret("old-token", OTHER) });
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "");

    const connection = await upsertMcpConnection({ enabled: true, platform: "notion", userId: "user-1" });

    // Setting the key brings the row back, so nothing is destroyed.
    expect(connection.token).toBeNull();
    expect(connection.secretsUnreadable).toBe(true);
    expect(fake.state.updates).toHaveLength(0);
  });

  it("writes nothing extra when the row it returns is readable", async () => {
    fake.state.existingRow = row({ oauth: sealOauth({ a: 1 }), token: encryptSecret("t") });

    const connection = await upsertMcpConnection({ enabled: true, platform: "notion", userId: "user-1" });

    expect(connection.token).toBe("t");
    expect(connection.oauth).toEqual({ a: 1 });
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe("reading rows", () => {
  it("decrypts the token and oauth state of an encrypted row", async () => {
    fake.state.selectRows = [
      row({
        oauth: sealOauth({ tokens: { access_token: "oauth-access" } }),
        token: encryptSecret("secret-token"),
      }),
    ];

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.token).toBe("secret-token");
    expect(connection?.oauth).toEqual({ tokens: { access_token: "oauth-access" } });
    expect(fake.state.updates).toHaveLength(0);
  });

  it("returns null when there is no row", async () => {
    expect(await getMcpConnection("user-1", "notion")).toBeNull();
  });

  it("decrypts every row of a list and the oauth_state lookup", async () => {
    fake.state.selectRows = [
      row({ id: "a", token: encryptSecret("one") }),
      row({ id: "b", platform: "slack", token: null }),
    ];

    const list = await listMcpConnections("user-1");
    const byState = await getMcpByOauthState("state-1");

    expect(list.map((connection) => connection.token)).toEqual(["one", null]);
    expect(byState?.token).toBe("one");
  });

  it("lists a row sealed with another key as unreadable, with null secrets, and does not throw", async () => {
    const staleToken = encryptSecret("old-token", OTHER);
    const staleOauth = sealOauth({ tokens: { access_token: "old-access" } }, OTHER);

    fake.state.selectRows = [
      row({ id: "a", oauth: staleOauth, token: staleToken }),
      row({ id: "b", platform: "slack", token: encryptSecret("one") }),
    ];

    const list = await listMcpConnections("user-1");

    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ id: "a", oauth: null, secretsUnreadable: true, token: null });
    expect(list[1]).toMatchObject({ id: "b", secretsUnreadable: false, token: "one" });

    // Never ciphertext, and a read never destroys the sealed values: the right
    // key brings them back.
    expect(JSON.stringify(list)).not.toContain(staleToken);
    expect(JSON.stringify(list)).not.toContain(staleOauth!.box);
    expect(fake.state.updates).toHaveLength(0);
  });

  it("flags a row whose oauth state alone is unreadable and keeps its readable token", async () => {
    fake.state.selectRows = [
      row({ oauth: sealOauth({ a: 1 }, OTHER), token: encryptSecret("secret-token") }),
    ];

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.token).toBe("secret-token");
    expect(connection?.oauth).toBeNull();
    expect(connection?.secretsUnreadable).toBe(true);
  });

  it("reads a damaged box as unreadable rather than as a legacy plaintext token", async () => {
    fake.state.selectRows = [row({ token: "v1:damaged" })];

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.token).toBeNull();
    expect(connection?.secretsUnreadable).toBe(true);
    // It is not re-encrypted in place as if it were plaintext.
    expect(fake.state.updates).toHaveLength(0);
  });

  it("marks a readable row as readable", async () => {
    fake.state.selectRows = [row({ token: encryptSecret("secret-token") })];

    expect((await getMcpConnection("user-1", "notion"))?.secretsUnreadable).toBe(false);
  });

  it("returns a legacy plaintext token and re-encrypts it in place with a compare-and-set", async () => {
    fake.state.selectRows = [row({ token: "legacy-token" })];

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.token).toBe("legacy-token");
    expect(fake.state.updates).toHaveLength(1);

    const [update] = fake.state.updates;

    expect(Object.keys(update!.set)).toEqual(["token"]);
    expect(isSecretBox(update!.set.token as string)).toBe(true);
    expect(decryptSecret(update!.set.token as string)).toBe("legacy-token");
    expect(render(update!.where)).toEqual({
      params: ["row-1", "legacy-token"],
      sql: '("mcp_connection"."id" = $1 and "mcp_connection"."token" = $2)',
    });
  });

  it("returns legacy oauth state and re-encrypts it with a compare-and-set", async () => {
    const legacy = { client: { client_id: "abc" }, tokens: { access_token: "oauth-access" } };

    fake.state.selectRows = [row({ oauth: legacy })];

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.oauth).toEqual(legacy);
    expect(fake.state.updates).toHaveLength(1);

    const [update] = fake.state.updates;

    expect(Object.keys(update!.set)).toEqual(["oauth"]);
    expect(JSON.stringify(update!.set)).not.toContain("oauth-access");
    expect(update!.set.oauth).toEqual({ box: expect.stringMatching(/^v1:/) });

    const { params, sql } = render(update!.where);

    expect(sql).toBe('("mcp_connection"."id" = $1 and "mcp_connection"."oauth" = $2::jsonb)');
    expect(params).toEqual(["row-1", JSON.stringify(legacy)]);
  });

  it("leaves legacy rows alone, and still reads them, when no key is configured", async () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "");
    fake.state.selectRows = [row({ oauth: { a: 1 }, token: "legacy-token" })];

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.token).toBe("legacy-token");
    expect(connection?.oauth).toEqual({ a: 1 });
    expect(fake.state.updates).toHaveLength(0);
  });

  it("still returns the row when the in-place re-encryption fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    fake.state.selectRows = [row({ token: "legacy-token" })];
    vi.spyOn(fake.db, "update").mockImplementationOnce(() => {
      throw new Error("database offline");
    });

    const connection = await getMcpConnection("user-1", "notion");

    expect(connection?.token).toBe("legacy-token");
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});

describe("patchMcpOauth", () => {
  it("merges into the existing state and stores it sealed", async () => {
    fake.state.selectRows = [row({ oauth: sealOauth({ verifier: "v1-verifier" }) })];

    await patchMcpOauth("user-1", "notion", { tokens: { access_token: "oauth-access" } });

    const writes = fake.state.updates.filter((update) => "oauth" in update.set);

    expect(writes).toHaveLength(1);
    expect(JSON.stringify(writes[0]!.set)).not.toContain("oauth-access");
    expect(JSON.stringify(writes[0]!.set)).not.toContain("v1-verifier");

    const sealed = writes[0]!.set.oauth as { box: string };

    expect(JSON.parse(decryptSecret(sealed.box))).toEqual({
      tokens: { access_token: "oauth-access" },
      verifier: "v1-verifier",
    });
  });

  it("replaces oauth state sealed with another key with fresh state, without reading it", async () => {
    fake.state.selectRows = [row({ oauth: sealOauth({ verifier: "old-verifier" }, OTHER) })];

    await patchMcpOauth("user-1", "notion", { verifier: "fresh" });

    const writes = fake.state.updates.filter((update) => "oauth" in update.set);

    expect(writes).toHaveLength(1);
    expect(JSON.parse(decryptSecret((writes[0]!.set.oauth as { box: string }).box))).toEqual({
      verifier: "fresh",
    });
  });

  it("starts from an empty object when the row has no oauth state", async () => {
    fake.state.selectRows = [row()];

    await patchMcpOauth("user-1", "notion", { verifier: "fresh" });

    const sealed = fake.state.updates[0]!.set.oauth as { box: string };

    expect(JSON.parse(decryptSecret(sealed.box))).toEqual({ verifier: "fresh" });
  });

  it("refuses to write when no key is configured", async () => {
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", "");
    fake.state.selectRows = [row()];

    await expect(patchMcpOauth("user-1", "notion", { verifier: "fresh" })).rejects.toThrow(
      SecretBoxError,
    );
    expect(fake.state.updates).toHaveLength(0);
  });
});

describe("setMcpOauthState", () => {
  it("keeps the oauth state plaintext because the callback looks rows up by it", async () => {
    await setMcpOauthState("user-1", "notion", "state-123");

    expect(fake.state.updates[0]!.set.oauthState).toBe("state-123");
  });
});
