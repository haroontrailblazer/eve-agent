import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret, isSecretBox, SecretBoxError } from "@/lib/crypto/secret-box";
import { sealOauth } from "@/lib/db/mcp-secrets";
import type { McpConnection } from "@/lib/db/schema";

// A recording stand-in for the drizzle client: selects resolve to `selectRows`,
// and every insert and update is captured so the tests can read what would have
// been sent to Postgres.
const fake = vi.hoisted(() => {
  const state = {
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
        onConflictDoUpdate: (conflict: unknown) => {
          state.inserts.push({ conflict, values });

          return new Query(() => [{ oauth: null, oauthState: null, ...values }]);
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

  it("never returns ciphertext when the key is wrong", async () => {
    fake.state.selectRows = [row({ token: encryptSecret("secret-token") })];
    vi.stubEnv("SOCIAL_TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 9).toString("base64"));

    await expect(getMcpConnection("user-1", "notion")).rejects.toThrow(SecretBoxError);
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
