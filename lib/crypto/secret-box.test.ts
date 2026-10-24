import { describe, expect, it } from "vitest";
import {
  decryptSecret,
  encryptSecret,
  isSecretBox,
  isTokenEncryptionConfigured,
  looksLikeSecretBox,
  openSecret,
  SecretBoxError,
} from "@/lib/crypto/secret-box";

const env = { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64") };
const other = { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(32, 9).toString("base64") };

function replaceSegment(box: string, index: number, update: (segment: string) => string) {
  const parts = box.split(":");
  parts[index] = update(parts[index]!);

  return parts.join(":");
}

function flipLastChar(segment: string) {
  return `${segment.slice(0, -1)}${segment.endsWith("A") ? "B" : "A"}`;
}

describe("encryptSecret and decryptSecret", () => {
  it("round trips", () => {
    expect(decryptSecret(encryptSecret("tok", env), env)).toBe("tok");
  });

  it("round trips an empty string and unicode", () => {
    expect(decryptSecret(encryptSecret("", env), env)).toBe("");
    expect(decryptSecret(encryptSecret("tökën 🔑", env), env)).toBe("tökën 🔑");
  });

  it("produces a different box each time", () => {
    expect(encryptSecret("tok", env)).not.toBe(encryptSecret("tok", env));
  });

  it("produces the versioned box format", () => {
    const box = encryptSecret("tok", env);

    expect(isSecretBox(box)).toBe(true);
    expect(box.startsWith("v1:")).toBe(true);
    expect(box).not.toContain("tok");
  });

  it("rejects a tampered tag", () => {
    const box = encryptSecret("tok", env);

    expect(() => decryptSecret(replaceSegment(box, 2, flipLastChar), env)).toThrow(SecretBoxError);
  });

  it("rejects a tampered ciphertext", () => {
    const box = encryptSecret("a long enough token", env);

    expect(() => decryptSecret(replaceSegment(box, 3, flipLastChar), env)).toThrow(SecretBoxError);
  });

  it("rejects a tampered iv", () => {
    const box = encryptSecret("tok", env);

    expect(() => decryptSecret(replaceSegment(box, 1, flipLastChar), env)).toThrow(SecretBoxError);
  });

  it("rejects the wrong key", () => {
    const box = encryptSecret("tok", env);

    expect(() => decryptSecret(box, other)).toThrow(SecretBoxError);
  });

  it("rejects a malformed box", () => {
    expect(() => decryptSecret("v1:abc", env)).toThrow(SecretBoxError);
    expect(() => decryptSecret("plain-token", env)).toThrow(SecretBoxError);
  });

  it("refuses to encrypt without a usable key", () => {
    expect(() => encryptSecret("tok", {})).toThrow(SecretBoxError);
    expect(() => encryptSecret("tok", { SOCIAL_TOKEN_ENCRYPTION_KEY: "" })).toThrow(SecretBoxError);
    expect(() =>
      encryptSecret("tok", { SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64") }),
    ).toThrow(SecretBoxError);
  });

  it("refuses to decrypt without a usable key", () => {
    const box = encryptSecret("tok", env);

    expect(() => decryptSecret(box, {})).toThrow(SecretBoxError);
  });
});

describe("isSecretBox", () => {
  it("rejects values that are not boxes", () => {
    expect(isSecretBox("plain-token")).toBe(false);
    expect(isSecretBox("")).toBe(false);
    expect(isSecretBox("v1:abc")).toBe(false);
    expect(isSecretBox("v2:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA:")).toBe(false);
  });
});

describe("openSecret", () => {
  it("passes legacy plaintext through", () => {
    expect(openSecret("plain-token", env)).toBe("plain-token");
  });

  it("returns null for null", () => {
    expect(openSecret(null, env)).toBeNull();
  });

  it("decrypts a box", () => {
    expect(openSecret(encryptSecret("tok", env), env)).toBe("tok");
  });

  it("throws for a box under the wrong key, so ciphertext never passes through as a token", () => {
    const box = encryptSecret("tok", env);

    expect(() => openSecret(box, other)).toThrow(SecretBoxError);
  });

  it("fails closed on a damaged box instead of passing it through as legacy plaintext", () => {
    const box = encryptSecret("tok", env);

    expect(() => openSecret("v1:abc", env)).toThrow(SecretBoxError);
    expect(() => openSecret("v1:", env)).toThrow(SecretBoxError);
    // A segment lost, and a segment cut short, so the value no longer matches
    // the box format.
    expect(() => openSecret(box.split(":").slice(0, 3).join(":"), env)).toThrow(SecretBoxError);
    expect(() => openSecret(replaceSegment(box, 1, (iv) => iv.slice(0, -2)), env)).toThrow(
      SecretBoxError,
    );
  });
});

describe("looksLikeSecretBox", () => {
  it("is true for anything with the v1: prefix, well formed or not", () => {
    expect(looksLikeSecretBox(encryptSecret("tok", env))).toBe(true);
    expect(looksLikeSecretBox("v1:abc")).toBe(true);
  });

  it("is false for legacy plaintext", () => {
    expect(looksLikeSecretBox("plain-token")).toBe(false);
    expect(looksLikeSecretBox("")).toBe(false);
    expect(looksLikeSecretBox("V1:abc")).toBe(false);
  });
});

describe("isTokenEncryptionConfigured", () => {
  it("is true for a 32 byte base64 key", () => {
    expect(isTokenEncryptionConfigured(env)).toBe(true);
  });

  it("is false when the key is missing, empty or the wrong size", () => {
    expect(isTokenEncryptionConfigured({})).toBe(false);
    expect(isTokenEncryptionConfigured({ SOCIAL_TOKEN_ENCRYPTION_KEY: "  " })).toBe(false);
    expect(
      isTokenEncryptionConfigured({
        SOCIAL_TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString("base64"),
      }),
    ).toBe(false);
  });
});
