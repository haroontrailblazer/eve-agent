import { getOwnerEmail, isEmailAllowed } from "@/lib/allowlist";
import { decideBrandAccess } from "@/lib/brand-access-policy";
import {
  addBrandMember,
  ensureOwnerBrand,
  findBrandIdForMember,
  findUserIdByEmail,
} from "@/lib/db/brands";

type BrandAccessErrorCode = "not_allowed" | "owner_not_signed_in";

const BRAND_ACCESS_MESSAGES: Record<BrandAccessErrorCode, string> = {
  not_allowed: "This account is not allowed to use harpy.",
  owner_not_signed_in:
    "harpy's owner has not signed in yet. Ask them to sign in once, then try again.",
};

export class BrandAccessError extends Error {
  readonly code: BrandAccessErrorCode;

  constructor(code: BrandAccessErrorCode) {
    super(BRAND_ACCESS_MESSAGES[code]);
    this.name = "BrandAccessError";
    this.code = code;
  }
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const brandIdCache = new Map<string, { readonly brandId: string; readonly expiresAt: number }>();

// The brand a signed-in user works in, creating the owner's brand and the
// user's membership on first use. Throws BrandAccessError when the user may
// not have one. Successful lookups are cached in-process for five minutes.
export async function getBrandIdForUser(user: {
  readonly id: string;
  readonly email: string;
}): Promise<string> {
  const cached = brandIdCache.get(user.id);

  if (cached && cached.expiresAt > Date.now()) {
    return cached.brandId;
  }

  const memberBrandId = await findBrandIdForMember(user.id);
  const ownerEmail = getOwnerEmail();
  const ownerUserId = !memberBrandId && ownerEmail ? await findUserIdByEmail(ownerEmail) : null;
  const decision = decideBrandAccess({
    userId: user.id,
    userEmail: user.email,
    allowed: isEmailAllowed(user.email),
    memberBrandId,
    ownerEmail,
    ownerUserId,
  });

  let brandId: string;

  switch (decision.kind) {
    case "deny":
      throw new BrandAccessError(decision.reason);
    case "use-member-brand":
      brandId = decision.brandId;
      break;
    case "ensure-owner-brand":
      brandId = (await ensureOwnerBrand(decision.ownerUserId)).id;
      break;
    case "join-owner-brand":
      brandId = (await ensureOwnerBrand(decision.ownerUserId)).id;
      await addBrandMember({ brandId, userId: user.id, role: "member" });
      break;
  }

  brandIdCache.set(user.id, { brandId, expiresAt: Date.now() + CACHE_TTL_MS });

  return brandId;
}
