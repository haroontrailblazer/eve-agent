import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

// AES-256-GCM envelope for secrets stored in Postgres (MCP tokens and OAuth
// state). A box is "v1:<iv>:<tag>:<ciphertext>", each part base64url. The key is
// SOCIAL_TOKEN_ENCRYPTION_KEY: 32 random bytes, base64 (openssl rand -base64 32).

type Env = Readonly<Record<string, string | undefined>>;

const KEY_ENV = "SOCIAL_TOKEN_ENCRYPTION_KEY";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const ALGORITHM = "aes-256-gcm";
const BOX_PREFIX = "v1:";
const BOX_PATTERN = /^v1:[A-Za-z0-9_-]{16}:[A-Za-z0-9_-]{22}:[A-Za-z0-9_-]*$/;

export class SecretBoxError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretBoxError";
  }
}

// True for a well formed box.
export function isSecretBox(value: string): boolean {
  return BOX_PATTERN.test(value);
}

// True for anything stored as a box, well formed or damaged. Use this, not
// isSecretBox, to tell a box from legacy plaintext: a damaged box must fail to
// open, never pass for a plaintext secret.
export function looksLikeSecretBox(value: string): boolean {
  return value.startsWith(BOX_PREFIX);
}

function readKey(env: Env): Buffer | null {
  const raw = env[KEY_ENV]?.trim();

  if (!raw) {
    return null;
  }

  const key = Buffer.from(raw, "base64");

  return key.length === KEY_BYTES ? key : null;
}

export function isTokenEncryptionConfigured(env: Env = process.env): boolean {
  return readKey(env) !== null;
}

function requireKey(env: Env): Buffer {
  const key = readKey(env);

  if (!key) {
    throw new SecretBoxError(
      `${KEY_ENV} must be set to 32 random bytes encoded as base64 (openssl rand -base64 32).`,
    );
  }

  return key;
}

// Decode a base64url segment, rejecting anything that does not re-encode to the
// same text. The last character of a segment carries spare bits that a lenient
// decoder drops, so without this a flipped final character could still decrypt.
function decodeSegment(segment: string, bytes: number | null): Buffer {
  const decoded = Buffer.from(segment, "base64url");

  if (decoded.toString("base64url") !== segment || (bytes !== null && decoded.length !== bytes)) {
    throw new SecretBoxError("Secret box is malformed.");
  }

  return decoded;
}

export function encryptSecret(plain: string, env: Env = process.env): string {
  const key = requireKey(env);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), tag.toString("base64url"), ciphertext.toString("base64url")].join(
    ":",
  );
}

export function decryptSecret(box: string, env: Env = process.env): string {
  if (!isSecretBox(box)) {
    throw new SecretBoxError("Secret box is malformed.");
  }

  const key = requireKey(env);
  const [, ivPart, tagPart, ciphertextPart] = box.split(":") as [string, string, string, string];
  const iv = decodeSegment(ivPart, IV_BYTES);
  const tag = decodeSegment(tagPart, TAG_BYTES);
  const ciphertext = decodeSegment(ciphertextPart, null);

  try {
    const decipher = createDecipheriv(ALGORITHM, key, iv);

    decipher.setAuthTag(tag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
  } catch {
    throw new SecretBoxError("Secret box could not be decrypted: wrong key or tampered data.");
  }
}

// A stored value is either a box or a legacy plaintext secret written before
// encryption existed. Anything with the box prefix is a box: one that cannot be
// opened, damaged or not, throws. It is never returned as if it were the secret.
export function openSecret(value: string | null, env: Env = process.env): string | null {
  if (value === null) {
    return null;
  }

  return looksLikeSecretBox(value) ? decryptSecret(value, env) : value;
}
