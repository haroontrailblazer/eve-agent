// Copy for /auth/error, keyed on the `error` code Better Auth (or our auth
// route) redirects with. showSetupLinks is false when the problem is the
// account, not the deployment, so setup docs would only mislead.

export type AuthErrorCopy = {
  readonly title: string;
  readonly body: string;
  readonly showSetupLinks: boolean;
};

export function getAuthErrorMessage(error: string | null, description: string | null): AuthErrorCopy {
  if (error === "not_allowed") {
    return {
      title: "This account can't use harpy",
      body:
        "harpy is private to its owner. Sign in with an allowed Vercel account, or ask the owner to add your email to HARPY_ALLOWED_EMAILS.",
      showSetupLinks: false,
    };
  }

  if (error === "email_not_found") {
    return {
      title: "Vercel email scope is missing",
      body:
        "Enable the email scope in your Vercel App, save the app, and try signing in again. Better Auth needs Vercel to return an email address for the signed-in user.",
      showSetupLinks: true,
    };
  }

  if (error === "invalid_scope") {
    return {
      title: "Vercel OAuth scopes need attention",
      body:
        "The requested Vercel OAuth scope is not enabled for this app. Enable openid, email, and profile in the Vercel App settings, then try again.",
      showSetupLinks: true,
    };
  }

  if (error === "database_not_configured") {
    return {
      title: "Neon is not connected",
      body:
        "Connect Neon Postgres to this Vercel project so DATABASE_URL is available, then run database migrations and try signing in again.",
      showSetupLinks: true,
    };
  }

  if (error === "database_migrations_missing") {
    return {
      title: "Database migrations are missing",
      body:
        "Run production migrations with vercel env run -e production -- pnpm db:migrate, then try signing in again. This creates the Better Auth and chat tables.",
      showSetupLinks: true,
    };
  }

  if (error === "auth_env_missing") {
    return {
      title: "Auth environment variables are missing",
      body:
        "Set BETTER_AUTH_SECRET, NEXT_PUBLIC_VERCEL_APP_CLIENT_ID, VERCEL_APP_CLIENT_SECRET, and HARPY_OWNER_EMAIL, then redeploy or restart the dev server.",
      showSetupLinks: true,
    };
  }

  const lowerDescription = description?.toLowerCase();

  if (lowerDescription?.includes("callback")) {
    return {
      title: "Callback URL is not allowed",
      body:
        "Add the exact callback URL you are using to the Vercel App: /api/auth/callback/vercel, including the protocol, domain, and local port.",
      showSetupLinks: true,
    };
  }

  if (
    lowerDescription?.includes("relation") ||
    lowerDescription?.includes("table") ||
    lowerDescription?.includes("database")
  ) {
    return {
      title: "Database migrations may be missing",
      body:
        "Run production migrations with vercel env run -e production -- pnpm db:migrate, then retry sign-in. This creates the Better Auth and chat tables.",
      showSetupLinks: true,
    };
  }

  return {
    title: "Sign-in could not finish",
    body:
      "Check the Vercel App callback URL, required scopes, Better Auth secret, and database migrations. The setup guide has the exact values to verify.",
    showSetupLinks: true,
  };
}
