import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getRedis: vi.fn() }));

vi.mock("@/lib/redis", () => ({ getRedis: mocks.getRedis }));

const { isWindowOpen, touchWindow } = await import("@/lib/whatsapp/window");

const NOW = new Date("2026-10-25T10:00:00.000Z");
const later = (ms: number) => new Date(NOW.getTime() + ms);
const HOUR = 3_600_000;

function fakeRedis(stored: string | null) {
  return { set: vi.fn().mockResolvedValue("OK"), get: vi.fn().mockResolvedValue(stored) };
}

beforeEach(() => mocks.getRedis.mockReset());

describe("touchWindow", () => {
  it("stores the time with a 24 hour expiry", async () => {
    const redis = fakeRedis(null);
    mocks.getRedis.mockReturnValue(redis);
    await touchWindow("1555", NOW);
    expect(redis.set).toHaveBeenCalledWith("wa:window:1555", NOW.toISOString(), { ex: 86_400 });
  });

  it("does nothing without Redis", async () => {
    mocks.getRedis.mockReturnValue(null);
    await expect(touchWindow("1555", NOW)).resolves.toBeUndefined();
  });
});

describe("isWindowOpen", () => {
  it("is open one hour after the last message", async () => {
    const redis = fakeRedis(NOW.toISOString());
    mocks.getRedis.mockReturnValue(redis);
    await expect(isWindowOpen("1555", later(HOUR))).resolves.toBe(true);
    expect(redis.get).toHaveBeenCalledWith("wa:window:1555");
  });

  it("counts as closed inside the safety margin", async () => {
    mocks.getRedis.mockReturnValue(fakeRedis(NOW.toISOString()));
    await expect(isWindowOpen("1555", later(23 * HOUR + 55 * 60_000))).resolves.toBe(false);
  });

  it("is closed without the key", async () => {
    mocks.getRedis.mockReturnValue(fakeRedis(null));
    await expect(isWindowOpen("1555", NOW)).resolves.toBe(false);
  });

  it("is closed for an unreadable value", async () => {
    mocks.getRedis.mockReturnValue(fakeRedis("nonsense"));
    await expect(isWindowOpen("1555", NOW)).resolves.toBe(false);
  });

  it("is closed without Redis", async () => {
    mocks.getRedis.mockReturnValue(null);
    await expect(isWindowOpen("1555", NOW)).resolves.toBe(false);
  });
});
