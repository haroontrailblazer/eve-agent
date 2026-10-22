import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { eq } from "drizzle-orm";
import { isEmailAllowed } from "@/lib/allowlist";
import { getAppOrigin, getConfiguredAppHosts } from "@/lib/app-origin";
import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

const vercelClientId = process.env.NEXT_PUBLIC_VERCEL_APP_CLIENT_ID?.trim() ?? "";
const vercelClientSecret = process.env.VERCEL_APP_CLIENT_SECRET?.trim() ?? "";
const betterAuthSecret = process.env.BETTER_AUTH_SECRET?.trim();
const vercelProviderConfigured = Boolean(betterAuthSecret && vercelClientId && vercelClientSecret);
const authBaseUrl = getAppOrigin();
const authProtocol = new URL(authBaseUrl).protocol === "https:" ? "https" : "http";
const allowedHosts = [
  "localhost:3000",
  "localhost:3001",
  "127.0.0.1:3000",
  "127.0.0.1:3001",
  "*.vercel.app",
  ...getConfiguredAppHosts(),
];

// Thrown from the database hooks below. In the OAuth callback Better Auth
// turns it into a redirect to /auth/error?error=not_allowed.
function notAllowedError() {
  return new APIError("FORBIDDEN", { message: "not_allowed" });
}

async function findUserEmail(userId: string): Promise<string | null> {
  const rows = await db
    .select({ email: user.email })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  return rows[0]?.email ?? null;
}

export const auth = betterAuth({
  baseURL: {
    allowedHosts,
    fallback: authBaseUrl,
    protocol: authProtocol,
  },
  database: drizzleAdapter(db, {
    provider: "pg",
  }),
  account: {
    encryptOAuthTokens: true,
    accountLinking: {
      enabled: true,
      trustedProviders: ["vercel"],
      allowDifferentEmails: true,
    },
  },
  secret: betterAuthSecret ?? "eve-chat-template-unconfigured-secret",
  advanced: {
    database: {
      generateId: () => randomUUID(),
    },
  },
  onAPIError: {
    errorURL: "/auth/error",
  },
  // The allowlist gate. New accounts that aren't allowed are never created;
  // existing accounts that aren't allowed (any more) never get a new session.
  databaseHooks: {
    user: {
      create: {
        before: async (newUser) => {
          if (!isEmailAllowed(newUser.email)) {
            throw notAllowedError();
          }
        },
      },
    },
    session: {
      create: {
        before: async (newSession, ctx) => {
          if (isEmailAllowed(await findUserEmail(newSession.userId))) {
            return;
          }

          if (ctx) {
            throw ctx.redirect("/auth/error?error=not_allowed");
          }

          throw notAllowedError();
        },
      },
    },
  },
  socialProviders: vercelProviderConfigured
    ? {
        vercel: {
          clientId: vercelClientId,
          clientSecret: vercelClientSecret,
          overrideUserInfoOnSignIn: true,
          scope: ["openid", "email", "profile"],
        },
      }
    : {},
  plugins: [nextCookies()],
});
