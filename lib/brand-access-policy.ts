// Which brand a signed-in user works in. Pure: the caller looks up the inputs
// and carries out the decision (see lib/brand-access.ts).

export type BrandAccessDecision =
  | { readonly kind: "use-member-brand"; readonly brandId: string }
  | { readonly kind: "ensure-owner-brand"; readonly ownerUserId: string }
  | { readonly kind: "join-owner-brand"; readonly ownerUserId: string }
  | { readonly kind: "deny"; readonly reason: "not_allowed" | "owner_not_signed_in" };

export function decideBrandAccess(input: {
  readonly userId: string;
  readonly userEmail: string;
  readonly allowed: boolean;
  readonly memberBrandId: string | null;
  readonly ownerEmail: string | null;
  readonly ownerUserId: string | null;
}): BrandAccessDecision {
  if (!input.allowed) {
    return { kind: "deny", reason: "not_allowed" };
  }

  if (input.memberBrandId) {
    return { kind: "use-member-brand", brandId: input.memberBrandId };
  }

  if (input.ownerEmail && input.userEmail.trim().toLowerCase() === input.ownerEmail) {
    return { kind: "ensure-owner-brand", ownerUserId: input.userId };
  }

  if (!input.ownerUserId) {
    return { kind: "deny", reason: "owner_not_signed_in" };
  }

  return { kind: "join-owner-brand", ownerUserId: input.ownerUserId };
}
