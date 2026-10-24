import { AlertCircleIcon, ArrowLeftIcon, ExternalLinkIcon } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { type AuthErrorCopy, getAuthErrorMessage } from "@/lib/auth-errors";

const SETUP_DOCS_URL =
  "https://github.com/vercel-labs/eve-chat-template/blob/main/docs/setup-and-deploy.md";
const SIGN_IN_WITH_VERCEL_URL =
  "https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites";
const SIGN_IN_WITH_VERCEL_SCOPES_URL =
  "https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions";

export default async function AuthErrorPage({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 py-10 text-foreground">
      <Suspense fallback={<AuthErrorCard message={getAuthErrorMessage(null, null)} />}>
        <AuthErrorContent searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function AuthErrorContent({
  searchParams,
}: {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = getParam(params.error);
  const errorDescription = getParam(params.error_description);
  const message = getAuthErrorMessage(error ?? null, errorDescription ?? null);

  return <AuthErrorCard error={error} message={message} />;
}

function AuthErrorCard({
  error,
  message,
}: {
  readonly error?: string;
  readonly message: AuthErrorCopy;
}) {
  return (
    <div className="w-full max-w-xl rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-destructive">
            <AlertCircleIcon className="size-4" />
          </div>
          <div className="min-w-0 space-y-2">
            <p className="text-sm font-medium text-muted-foreground">Authentication setup</p>
            <h1 className="text-2xl font-semibold tracking-normal">{message.title}</h1>
            <p className="text-sm leading-6 text-muted-foreground">{message.body}</p>
            {error ? (
              <p className="rounded-md border border-border bg-muted/30 px-3 py-2 font-mono text-xs text-muted-foreground">
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-2">
          <Button asChild className="h-8 rounded-md px-3 text-sm">
            <Link href="/">
              <ArrowLeftIcon className="size-4" />
              Back to Studio
            </Link>
          </Button>
          {message.showSetupLinks ? (
            <>
              <Button asChild className="h-8 rounded-md px-3 text-sm" variant="outline">
                <a href={SETUP_DOCS_URL} rel="noreferrer" target="_blank">
                  Setup guide
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </Button>
              <Button asChild className="h-8 rounded-md px-3 text-sm" variant="outline">
                <a
                  href={
                    error === "email_not_found"
                      ? SIGN_IN_WITH_VERCEL_SCOPES_URL
                      : SIGN_IN_WITH_VERCEL_URL
                  }
                  rel="noreferrer"
                  target="_blank"
                >
                  Vercel OAuth docs
                  <ExternalLinkIcon className="size-3.5" />
                </a>
              </Button>
            </>
          ) : null}
        </div>
      </div>
  );
}

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
