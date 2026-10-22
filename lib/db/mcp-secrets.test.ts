import { describe, expect, it } from "vitest";
import { encryptSecret, SecretBoxError } from "@/lib/crypto/secret-box";
import { isSealedOauth, openOauth, sealOauth } from "@/lib/db/mcp-secrets";

const env = { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
const other = { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };

describe("sealOauth", () => {
  it("wraps the value in a box", () => {
    expect(sealOauth({ a: 1 }, env)?.box.startsWith("v1:")).toBe(true);
  });

  it("keeps null as null", () => {
    expect(sealOauth(null, env)).toBeNull();
  });

  it("refuses to seal without a key", () => {
    expect(() => sealOauth({ a: 1 }, {})).toThrow(SecretBoxError);
  });

  it("does not leak values into the stored shape", () => {
    const sealed = sealOauth({ tokens: { access_token: "secret-access" } }, env);

    expect(Object.keys(sealed ?? {})).toEqual(["box"]);
    expect(JSON.stringify(sealed)).not.toContain("secret-access");
  });
});

describe("openOauth", () => {
  it("round trips a sealed value", () => {
    expect(openOauth(sealOauth({ a: 1 }, env), env)).toEqual({ a: 1 });
  });

  it("passes a legacy object through", () => {
    expect(openOauth({ a: 1 }, env)).toEqual({ a: 1 });
  });

  it("returns null for null and undefined", () => {
    expect(openOauth(null, env)).toBeNull();
    expect(openOauth(undefined, env)).toBeNull();
  });

  it("throws under the wrong key instead of returning the box", () => {
    expect(() => openOauth(sealOauth({ a: 1 }, env), other)).toThrow(SecretBoxError);
  });

  it("throws when a sealed payload is not a json object", () => {
    expect(() => openOauth({ box: encryptSecret("[1]", env) }, env)).toThrow(SecretBoxError);
    expect(() => openOauth({ box: encryptSecret("not json", env) }, env)).toThrow(SecretBoxError);
  });
});

describe("isSealedOauth", () => {
  it("recognizes only the sealed shape", () => {
    expect(isSealedOauth(sealOauth({ a: 1 }, env))).toBe(true);
    expect(isSealedOauth({ a: 1 })).toBe(false);
    expect(isSealedOauth({ box: "not-a-box" })).toBe(false);
    expect(isSealedOauth({ box: encryptSecret("{}", env), extra: true })).toBe(false);
    expect(isSealedOauth(null)).toBe(false);
  });
});
