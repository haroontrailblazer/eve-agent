import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateLimitError } from "@/lib/rate-limit";

const store = new Map<string, string>();
const fakeRedis = {
  del: vi.fn(async (key: string) => (store.delete(key) ? 1 : 0)),
  get: vi.fn(async (key: string) => store.get(key) ?? null),
  getdel: vi.fn(async (key: string) => {
    const value = store.get(key) ?? null;
    store.delete(key);
    return value;
  }),
  set: vi.fn(async (key: string, value: string, options?: { nx?: boolean; ex?: number }) => {
    if (options?.nx && store.has(key)) {
      return null;
    }
    store.set(key, value);
    return "OK";
  }),
};
let redisEnabled = true;

vi.mock("@/lib/redis", () => ({ getRedis: () => (redisEnabled ? fakeRedis : null) }));
vi.mock("@/lib/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/rate-limit")>()),
  enforceRateLimit: vi.fn(),
}));
const linkIdentity = vi.fn();
vi.mock("@/lib/db/channel-identities", () => ({
  linkIdentity: (...args: unknown[]) => linkIdentity(...args),
}));
const findEmailByUserId = vi.fn();
const isBrandMember = vi.fn();
vi.mock("@/lib/db/brands", () => ({
  findEmailByUserId: (...args: unknown[]) => findEmailByUserId(...args),
  isBrandMember: (...args: unknown[]) => isBrandMember(...args),
}));

import {
  createLinkCode,
  LinkCodeUnavailableError,
  parseLinkCommand,
  redeemLinkCode,
} from "@/lib/link-codes";
import { enforceRateLimit } from "@/lib/rate-limit";

beforeEach(() => {
  vi.stubEnv("HARPY_OWNER_EMAIL", "owner@example.com");
  vi.stubEnv("HARPY_ALLOWED_EMAILS", "");
  store.clear();
  redisEnabled = true;
  vi.clearAllMocks();
  findEmailByUserId.mockResolvedValue("owner@example.com");
  isBrandMember.mockResolvedValue(true);
});

describe("parseLinkCommand", () => {
  it("accepts link commands", () => {
    expect(parseLinkCommand("link 123456")).toBe("123456");
    expect(parseLinkCommand(" LINK 123456 ")).toBe("123456");
  });

  it("rejects everything else", () => {
    expect(parseLinkCommand("LINK 12345")).toBeNull();
    expect(parseLinkCommand("please link 123456")).toBeNull();
    expect(parseLinkCommand("LINK 1234567")).toBeNull();
  });
});

describe("createLinkCode", () => {
  it("writes the code with nx and a ttl, replacing the user's previous code", async () => {
    const first = await createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" });
    const second = await createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" });

    expect(first.code).toMatch(/^\d{6}$/);
    expect(fakeRedis.set).toHaveBeenCalledWith(
      `link:code:whatsapp:${second.code}`,
      JSON.stringify({ brandId: "b1", userId: "u1" }),
      { ex: 600, nx: true },
    );
    expect(fakeRedis.del).toHaveBeenCalledWith(`link:code:whatsapp:${first.code}`);
    expect(store.get("link:user:whatsapp:u1")).toBe(second.code);
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "u1", limit: 10, prefix: "link:create" }),
    );
    expect(Date.parse(second.expiresAt)).toBeGreaterThan(Date.now());
  });

  it("throws without redis", async () => {
    redisEnabled = false;

    await expect(
      createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" }),
    ).rejects.toBeInstanceOf(LinkCodeUnavailableError);
  });

  it("propagates the rate limit error", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValueOnce(new RateLimitError(30));

    await expect(
      createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" }),
    ).rejects.toBeInstanceOf(RateLimitError);
  });
});

describe("redeemLinkCode", () => {
  it("links the code's user once", async () => {
    const { code } = await createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" });
    const input = { channel: "whatsapp", code, externalId: "14155550100", phone: "14155550100" } as const;

    expect(await redeemLinkCode(input)).toEqual({ email: "owner@example.com", ok: true });
    expect(linkIdentity).toHaveBeenCalledWith({
      brandId: "b1",
      bsuid: null,
      channel: "whatsapp",
      externalId: "14155550100",
      phone: "14155550100",
      userId: "u1",
    });
    expect(store.has("link:user:whatsapp:u1")).toBe(false);
    expect(await redeemLinkCode(input)).toEqual({ ok: false, reason: "invalid" });
    expect(linkIdentity).toHaveBeenCalledTimes(1);
  });

  it("rejects a wrong code", async () => {
    expect(
      await redeemLinkCode({ channel: "whatsapp", code: "000000", externalId: "1" }),
    ).toEqual({ ok: false, reason: "invalid" });
  });

  it("rejects a code whose user is no longer a member", async () => {
    const { code } = await createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" });
    isBrandMember.mockResolvedValue(false);

    expect(await redeemLinkCode({ channel: "whatsapp", code, externalId: "1" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("rejects a code whose user is no longer allowed", async () => {
    const { code } = await createLinkCode({ brandId: "b1", channel: "whatsapp", userId: "u1" });
    findEmailByUserId.mockResolvedValue("removed@example.com");

    expect(await redeemLinkCode({ channel: "whatsapp", code, externalId: "1" })).toEqual({
      ok: false,
      reason: "invalid",
    });
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("is limited without reading the code", async () => {
    vi.mocked(enforceRateLimit).mockRejectedValueOnce(new RateLimitError(30));

    expect(
      await redeemLinkCode({ channel: "whatsapp", code: "123456", externalId: "1" }),
    ).toEqual({ ok: false, reason: "limited" });
    expect(fakeRedis.getdel).not.toHaveBeenCalled();
  });

  it("applies both attempt limits", async () => {
    await redeemLinkCode({ channel: "slack", code: "123456", externalId: "T1:U1" });

    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "slack:T1:U1", limit: 5, prefix: "link:attempt" }),
    );
    expect(enforceRateLimit).toHaveBeenCalledWith(
      expect.objectContaining({ key: "all", limit: 30, prefix: "link:attempt:all" }),
    );
  });

  it("is unavailable without redis", async () => {
    redisEnabled = false;

    expect(
      await redeemLinkCode({ channel: "whatsapp", code: "123456", externalId: "1" }),
    ).toEqual({ ok: false, reason: "unavailable" });
  });
});
