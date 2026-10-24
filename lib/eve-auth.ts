import { type AuthFn, ForbiddenError } from "eve/channels/auth";
import { isEmailAllowed } from "@/lib/allowlist";
import { auth } from "@/lib/auth";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import { isAppConfigured } from "@/lib/setup";

export const betterAuthEveAuth: AuthFn<Request> = async (request) => {
  if (!(await isAppConfigured())) {
    return null;
  }

  const session = await auth.api.getSession({
    headers: request.headers,
  });

  if (!session?.user) {
    return null;
  }

  const { email, id, name } = session.user;

  // Throw rather than return null: null would fall through to the next entry
  // in the auth walk (localDev() during development).
  if (!isEmailAllowed(email)) {
    throw new ForbiddenError({
      code: "not_allowed",
      message: "This account is not allowed to use harpy.",
    });
  }

  const brandId = await getBrandIdForUser({ email, id }).catch((error: unknown) => {
    if (error instanceof BrandAccessError) {
      throw new ForbiddenError({ code: error.code, message: error.message });
    }

    throw error;
  });

  return {
    // Tools read the brand from here and never from their input.
    attributes: {
      brandId,
      channel: "web",
      email,
      name,
    },
    authenticator: "better-auth",
    issuer: "better-auth",
    principalId: id,
    principalType: "user",
    subject: email,
  };
};
