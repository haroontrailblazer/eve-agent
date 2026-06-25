import type { ReactNode } from "react";

const EVE_URL = "https://vercel.com/eve";
const GITHUB_URL = "https://github.com/vercel-labs/eve-chat-template";
const DEPLOY_PRODUCTS = [
  {
    type: "integration",
    protocol: "storage",
    productSlug: "neon",
    integrationSlug: "neon",
  },
  {
    type: "integration",
    protocol: "storage",
    productSlug: "upstash-kv",
    integrationSlug: "upstash",
  },
] as const;
const DEPLOY_ENV_VARS = [
  "BETTER_AUTH_SECRET",
  "NEXT_PUBLIC_VERCEL_APP_CLIENT_ID",
  "VERCEL_APP_CLIENT_SECRET",
] as const;
const DEPLOY_URL = (() => {
  const params = new URLSearchParams([
    ["project-name", "eve-chat-template"],
    ["repository-name", "eve-chat-template"],
    ["repository-url", `${GITHUB_URL}/tree/main`],
    ["env", DEPLOY_ENV_VARS.join(",")],
    [
      "envDescription",
      "Neon provisions DATABASE_URL. Upstash Redis provisions rate-limit storage. Add Better Auth secret and Sign in with Vercel credentials. After deploy, run production migrations from the setup guide.",
    ],
    ["envLink", `${GITHUB_URL}/blob/main/docs/setup-and-deploy.md`],
    ["products", JSON.stringify(DEPLOY_PRODUCTS)],
  ]);

  return `https://vercel.com/new/clone?${params.toString()}`;
})();

export function TemplateFooterLinks() {
  return (
    <footer className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 gap-y-1 px-2 text-center text-[11px] leading-4 text-muted-foreground/50 sm:text-xs">
      <span>
        Build your own chat agent with <FooterLink href={EVE_URL}>eve</FooterLink>:
      </span>
      <span>
        <FooterLink href={GITHUB_URL}>GitHub</FooterLink>,
      </span>
      <span>
        <FooterLink href={DEPLOY_URL}>Deploy</FooterLink>
      </span>
    </footer>
  );
}

function FooterLink({
  children,
  href,
}: {
  readonly children: ReactNode;
  readonly href: string;
}) {
  return (
    <a
      className="underline underline-offset-4 transition-colors hover:text-foreground"
      href={href}
      rel="noreferrer"
      target="_blank"
    >
      {children}
    </a>
  );
}
