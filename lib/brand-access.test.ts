import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import {
  addBrandMember,
  ensureOwnerBrand,
  findBrandIdForMember,
  findUserIdByEmail,
} from "@/lib/db/brands";

vi.mock("@/lib/db/brands", () => ({
  addBrandMember: vi.fn(async () => undefined),
  ensureOwnerBrand: vi.fn(async (ownerUserId: string) => ({ id: `brand-of-${ownerUserId}` })),
  findBrandIdForMember: vi.fn(async () => null),
  findUserIdByEmail: vi.fn(async () => null),
  isBrandMember: vi.fn(async () => false),
}));

// The cache is per user id and lives for the whole module, so each test uses
// its own ids.
let counter = 0;
function nextUser(email: string) {
  counter += 1;
  return { id: `u-${counter}`, email };
}

beforeEach(() => {
  vi.stubEnv("HARPY_OWNER_EMAIL", "owner@x.com");
  vi.stubEnv("HARPY_ALLOWED_EMAILS", "member@x.com");
});

afterEach(() => {
  // Back to the factory implementations above, with no recorded calls.
  vi.resetAllMocks();
  vi.useRealTimers();
});

describe("getBrandIdForUser", () => {
  it("uses the brand the user is already a member of", async () => {
    vi.mocked(findBrandIdForMember).mockResolvedValueOnce("b1");

    await expect(getBrandIdForUser(nextUser("member@x.com"))).resolves.toBe("b1");
    expect(ensureOwnerBrand).not.toHaveBeenCalled();
    expect(addBrandMember).not.toHaveBeenCalled();
  });

  it("creates the owner's brand for the owner", async () => {
    const owner = nextUser("Owner@X.com");

    await expect(getBrandIdForUser(owner)).resolves.toBe(`brand-of-${owner.id}`);
    expect(ensureOwnerBrand).toHaveBeenCalledWith(owner.id);
  });

  it("adds an allowed non-owner to the owner's brand as a member", async () => {
    const member = nextUser("member@x.com");
    vi.mocked(findUserIdByEmail).mockResolvedValueOnce("u-owner");

    await expect(getBrandIdForUser(member)).resolves.toBe("brand-of-u-owner");
    expect(findUserIdByEmail).toHaveBeenCalledWith("owner@x.com");
    expect(ensureOwnerBrand).toHaveBeenCalledWith("u-owner");
    expect(addBrandMember).toHaveBeenCalledWith({
      brandId: "brand-of-u-owner",
      userId: member.id,
      role: "member",
    });
  });

  it("rejects a non-owner while the owner has not signed in", async () => {
    const error = await getBrandIdForUser(nextUser("member@x.com")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BrandAccessError);
    expect((error as BrandAccessError).code).toBe("owner_not_signed_in");
    expect(ensureOwnerBrand).not.toHaveBeenCalled();
  });

  it("rejects an email that is not allowed without writing anything", async () => {
    vi.mocked(findBrandIdForMember).mockResolvedValueOnce("b1");

    const error = await getBrandIdForUser(nextUser("stranger@x.com")).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BrandAccessError);
    expect((error as BrandAccessError).code).toBe("not_allowed");
    expect(ensureOwnerBrand).not.toHaveBeenCalled();
    expect(addBrandMember).not.toHaveBeenCalled();
  });

  it("caches the brand per user for five minutes", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-22T00:00:00Z") });
    const member = nextUser("member@x.com");
    vi.mocked(findBrandIdForMember).mockResolvedValue("b1");

    await getBrandIdForUser(member);
    vi.setSystemTime(new Date("2026-10-22T00:04:59Z"));
    await expect(getBrandIdForUser(member)).resolves.toBe("b1");
    expect(findBrandIdForMember).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-22T00:05:01Z"));
    await getBrandIdForUser(member);
    expect(findBrandIdForMember).toHaveBeenCalledTimes(2);
  });

  it("does not cache a denial", async () => {
    const member = nextUser("member@x.com");

    await expect(getBrandIdForUser(member)).rejects.toBeInstanceOf(BrandAccessError);
    vi.mocked(findUserIdByEmail).mockResolvedValueOnce("u-owner");
    await expect(getBrandIdForUser(member)).resolves.toBe("brand-of-u-owner");
  });
});
