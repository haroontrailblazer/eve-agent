import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findLinkedIdentity = vi.fn();
const linkIdentity = vi.fn();
const findUserIdByEmail = vi.fn();
const ensureOwnerBrand = vi.fn();
const isBrandMember = vi.fn();

vi.mock("@/lib/db/channel-identities", () => ({
  findLinkedIdentity: (...args: unknown[]) => findLinkedIdentity(...args),
  linkIdentity: (...args: unknown[]) => linkIdentity(...args),
}));
vi.mock("@/lib/db/brands", () => ({
  ensureOwnerBrand: (...args: unknown[]) => ensureOwnerBrand(...args),
  findUserIdByEmail: (...args: unknown[]) => findUserIdByEmail(...args),
  isBrandMember: (...args: unknown[]) => isBrandMember(...args),
}));

import { resolveChannelAuth } from "@/lib/channel-auth";

const identity = {
  brandId: "brand-1",
  email: "owner@example.com",
  name: "Owner",
  userId: "user-1",
};

beforeEach(() => {
  vi.stubEnv("HARPY_OWNER_EMAIL", "owner@example.com");
  vi.stubEnv("HARPY_ALLOWED_EMAILS", "");
  vi.stubEnv("HARPY_WHATSAPP_ALLOWED_NUMBERS", "+1 415 555 0100");
  findLinkedIdentity.mockReset();
  linkIdentity.mockReset();
  findUserIdByEmail.mockReset();
  ensureOwnerBrand.mockReset();
  isBrandMember.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("resolveChannelAuth", () => {
  it("returns the principal for a linked, allowed identity", async () => {
    findLinkedIdentity.mockResolvedValue(identity);

    const auth = await resolveChannelAuth({
      channel: "whatsapp",
      externalId: "14155550100",
      extraAttributes: { waId: "14155550100" },
    });

    expect(auth).toEqual({
      attributes: {
        brandId: "brand-1",
        channel: "whatsapp",
        email: "owner@example.com",
        name: "Owner",
        waId: "14155550100",
      },
      authenticator: "harpy-whatsapp",
      issuer: "whatsapp",
      principalId: "user-1",
      principalType: "user",
      subject: "owner@example.com",
    });
    expect(Object.values(auth?.attributes ?? {}).every((v) => typeof v === "string")).toBe(true);
  });

  it("returns null when the email is no longer allowed", async () => {
    vi.stubEnv("HARPY_OWNER_EMAIL", "someone-else@example.com");
    findLinkedIdentity.mockResolvedValue(identity);

    expect(await resolveChannelAuth({ channel: "whatsapp", externalId: "14155550100" })).toBeNull();
  });

  it("returns null when the user is no longer a brand member", async () => {
    findLinkedIdentity.mockResolvedValue(identity);
    isBrandMember.mockResolvedValue(false);

    expect(await resolveChannelAuth({ channel: "whatsapp", externalId: "14155550100" })).toBeNull();
  });

  it("links an allowed number to the owner on first contact", async () => {
    findLinkedIdentity.mockResolvedValueOnce(null).mockResolvedValueOnce(identity);
    findUserIdByEmail.mockResolvedValue("user-1");
    ensureOwnerBrand.mockResolvedValue({ id: "brand-1" });

    const auth = await resolveChannelAuth({
      bsuid: "US.abc",
      channel: "whatsapp",
      externalId: "14155550100",
      phone: "14155550100",
    });

    expect(findUserIdByEmail).toHaveBeenCalledWith("owner@example.com");
    expect(linkIdentity).toHaveBeenCalledWith({
      brandId: "brand-1",
      bsuid: "US.abc",
      channel: "whatsapp",
      externalId: "14155550100",
      phone: "14155550100",
      userId: "user-1",
    });
    expect(auth?.principalId).toBe("user-1");
  });

  it("returns null without linking when the owner has never signed in", async () => {
    findLinkedIdentity.mockResolvedValue(null);
    findUserIdByEmail.mockResolvedValue(null);

    expect(await resolveChannelAuth({ channel: "whatsapp", externalId: "14155550100" })).toBeNull();
    expect(linkIdentity).not.toHaveBeenCalled();
  });

  it("returns null for an unlinked number that is not allowed", async () => {
    findLinkedIdentity.mockResolvedValue(null);

    expect(await resolveChannelAuth({ channel: "whatsapp", externalId: "14155550199" })).toBeNull();
    expect(findUserIdByEmail).not.toHaveBeenCalled();
  });

  it("never applies allowed numbers to slack", async () => {
    findLinkedIdentity.mockResolvedValue(null);

    expect(await resolveChannelAuth({ channel: "slack", externalId: "14155550100" })).toBeNull();
    expect(findUserIdByEmail).not.toHaveBeenCalled();
  });
});
