import { type AuthFn, ForbiddenError, localDev } from "eve/channels/auth";
import { getOwnerEmail } from "@/lib/allowlist";
import { getBrandIdForUser } from "@/lib/brand-access";
import { findUserIdByEmail } from "@/lib/db/brands";

// Local eval sign-in. When the dev server runs with HARPY_EVAL_AS_OWNER=1,
// a caller that localDev() accepts is treated as the owner, so evals can run
// the real tools against the owner's brand. It is inert on any deployment:
// Vercel preview and production both run with NODE_ENV=production.
export type EvalOwnerDeps = {
  readonly localDev: AuthFn<Request>;
  readonly findOwner: () => Promise<{ readonly id: string; readonly email: string } | null>;
  readonly brandFor: (user: { readonly id: string; readonly email: string }) => Promise<string>;
  readonly env: () => Readonly<Record<string, string | undefined>>;
};

export function createEvalOwnerAuth(deps: EvalOwnerDeps): AuthFn<Request> {
  return async (request) => {
    // Env first: nothing else runs unless this is local and opted in.
    const env = deps.env();
    if (env.NODE_ENV === "production" || env.HARPY_EVAL_AS_OWNER !== "1") {
      return null;
    }

    if (!(await deps.localDev(request))) {
      return null;
    }

    const owner = await deps.findOwner();
    if (!owner) {
      throw new ForbiddenError({
        code: "owner_not_signed_in",
        message: "Sign in to harpy once as the owner before running evals.",
      });
    }

    const brandId = await deps.brandFor(owner);

    // No allowToolStubs: evals run the real tools.
    return {
      attributes: {
        brandId,
        channel: "eval",
        email: owner.email,
        name: "eval",
      },
      authenticator: "harpy-eval",
      issuer: "harpy-eval",
      principalId: owner.id,
      principalType: "user",
      subject: owner.email,
    };
  };
}

export const evalOwnerAuth: AuthFn<Request> = createEvalOwnerAuth({
  localDev: localDev(),
  findOwner: async () => {
    const email = getOwnerEmail();
    if (!email) return null;
    const id = await findUserIdByEmail(email);
    return id ? { id, email } : null;
  },
  brandFor: (user) => getBrandIdForUser(user),
  env: () => process.env,
});
