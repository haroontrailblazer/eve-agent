import { describe, expect, it } from "vitest";
import { decideBrandAccess } from "@/lib/brand-access-policy";

const base = {
  userId: "u-1",
  userEmail: "member@x.com",
  allowed: true,
  memberBrandId: null,
  ownerEmail: "owner@x.com",
  ownerUserId: null,
} as const;

describe("decideBrandAccess", () => {
  it("denies an email that is not allowed", () => {
    expect(decideBrandAccess({ ...base, allowed: false })).toEqual({
      kind: "deny",
      reason: "not_allowed",
    });
  });

  it("denies a disallowed email even when it already has a member brand", () => {
    expect(decideBrandAccess({ ...base, allowed: false, memberBrandId: "b1" })).toEqual({
      kind: "deny",
      reason: "not_allowed",
    });
  });

  it("uses the brand the user is already a member of", () => {
    expect(decideBrandAccess({ ...base, memberBrandId: "b1" })).toEqual({
      kind: "use-member-brand",
      brandId: "b1",
    });
  });

  it("ensures the owner's brand for the owner, keyed on the owner's own id", () => {
    expect(
      decideBrandAccess({ ...base, userEmail: "owner@x.com", ownerUserId: null }),
    ).toEqual({ kind: "ensure-owner-brand", ownerUserId: "u-1" });
  });

  it("matches the owner email case-insensitively", () => {
    expect(decideBrandAccess({ ...base, userEmail: "Owner@X.com" })).toEqual({
      kind: "ensure-owner-brand",
      ownerUserId: "u-1",
    });
  });

  it("denies a non-owner while the owner has not signed in", () => {
    expect(decideBrandAccess({ ...base, ownerUserId: null })).toEqual({
      kind: "deny",
      reason: "owner_not_signed_in",
    });
  });

  it("denies a non-owner when no owner email is configured", () => {
    expect(decideBrandAccess({ ...base, ownerEmail: null, ownerUserId: null })).toEqual({
      kind: "deny",
      reason: "owner_not_signed_in",
    });
  });

  it("joins a non-owner to the owner's brand once the owner has signed in", () => {
    expect(decideBrandAccess({ ...base, ownerUserId: "u-owner" })).toEqual({
      kind: "join-owner-brand",
      ownerUserId: "u-owner",
    });
  });
});
