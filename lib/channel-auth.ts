import type { AuthResult } from "eve/channels/auth";
import { getOwnerEmail, isEmailAllowed } from "@/lib/allowlist";
import { ensureOwnerBrand, findUserIdByEmail, isBrandMember } from "@/lib/db/brands";
import {
  type ChannelIdentityKind,
  findLinkedIdentity,
  linkIdentity,
} from "@/lib/db/channel-identities";
import { getAllowedWhatsAppNumbers, normalizeWaNumber } from "@/lib/whatsapp/config";

// One eve principal for every linked chat sender. It has the same attribute
// shape as the web principal in lib/eve-auth.ts, so tools resolve the brand
// the same way whichever channel the turn came from.
export async function resolveChannelAuth(input: {
  readonly channel: ChannelIdentityKind;
  readonly externalId: string;
  readonly phone?: string | null;
  readonly bsuid?: string | null;
  readonly extraAttributes?: Readonly<Record<string, string>>;
}): Promise<AuthResult | null> {
  const { channel, externalId } = input;
  let identity = await findLinkedIdentity(channel, externalId);

  if (!identity && channel === "whatsapp") {
    const number = normalizeWaNumber(input.phone ?? externalId);

    // Numbers on the allow list are the owner's own; they link on first contact.
    if (number && getAllowedWhatsAppNumbers().includes(number)) {
      const ownerEmail = getOwnerEmail();
      const ownerId = ownerEmail ? await findUserIdByEmail(ownerEmail) : null;

      if (!ownerId) {
        return null;
      }

      const brand = await ensureOwnerBrand(ownerId);
      await linkIdentity({
        brandId: brand.id,
        bsuid: input.bsuid ?? null,
        channel,
        externalId,
        phone: input.phone ?? number,
        userId: ownerId,
      });
      identity = await findLinkedIdentity(channel, externalId);
    }
  }

  if (!identity) {
    return null;
  }

  if (!isEmailAllowed(identity.email) || !(await isBrandMember(identity.brandId, identity.userId))) {
    return null;
  }

  return {
    attributes: {
      ...input.extraAttributes,
      brandId: identity.brandId,
      channel,
      email: identity.email,
      ...(identity.name ? { name: identity.name } : {}),
    },
    authenticator: `harpy-${channel}`,
    issuer: channel,
    principalId: identity.userId,
    principalType: "user",
    subject: identity.email,
  };
}
