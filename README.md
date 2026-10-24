# harpy

harpy is a private social media control room built on [eve](https://beta.eve.dev) (0.82) and Next.js 16. It has an agent chat, a studio for drafts and images, and a sidebar shell for the planning pages around them. It uses shadcn/ui, Tailwind CSS, Streamdown, Better Auth, Drizzle, Neon, Upstash Redis and Vercel Blob.

harpy is a fork of the eve chat template. Only the owner and the emails on the allowlist can sign in.

## Phase 1 status: foundation

Done on the `harpy-v2` branch:

- **Chat.** The web chat runs on eve 0.82 `useEveAgent` with resume. Events persist by eve's `meta.id` and load in `event_index` order. Chats from before the upgrade are legacy and read-only.
- **Auth and brands.** An email allowlist, plus `brand`, `brand_member` and `channel_identity` tables. Every web principal carries a verified `brandId`.
- **Media.** Images live on public Vercel Blob, with SSRF-safe source loading and direct browser uploads.
- **Secrets.** MCP tokens and OAuth state are encrypted at rest with `SOCIAL_TOKEN_ENCRYPTION_KEY`.
- **Design system.** Silver tokens, a type scale, status and platform glyph colors, a system/light/dark theme setting, shadcn primitives and harpy components, all shown on `/design`.
- **Shell and pages.** A sidebar shell with Studio, Calendar, Inbox, Brief, Brand voice, Channels, Chat and Settings. `/profile` redirects to `/settings`.

Not done yet: migrations 0006 to 0009 are generated but not applied, and the manual verification pass has not been run. See the owner checklist in [Setup and Deployment](docs/setup-and-deploy.md#owner-verification-checklist). Publishing, scheduling and the real content pages come in later phases.

## Setup

Requirements: Node.js 24 or newer, pnpm 10.12.4 (through Corepack), a Vercel account.

```bash
corepack enable
pnpm install
vercel link
vercel env pull .env.local --yes
```

Then set the harpy variables from `.env.example`:

```bash
HARPY_OWNER_EMAIL=
HARPY_ALLOWED_EMAILS=
SOCIAL_TOKEN_ENCRYPTION_KEY=   # openssl rand -base64 32
BLOB_READ_WRITE_TOKEN=         # a public Vercel Blob store; needed for images and uploads, chat works without it
AI_GATEWAY_API_KEY=            # local only, or use VERCEL_OIDC_TOKEN from vercel env pull
```

`scripts/setup.sh` still provisions Neon, Upstash and the Sign in with Vercel app, but it does not set the harpy variables above. Set them yourself.

Back up the database first (a Neon branch), then apply the migrations and start the app:

```bash
pnpm db:migrate
pnpm dev
```

In production, deploy harpy-v2 first and then run `pnpm db:migrate:production` right away (see [deploy first, then migrate](docs/setup-and-deploy.md#production-deploy-first-then-migrate)). The full guide, including Vercel Blob, the encryption key warning, Vercel Hobby limits and the local eve build, is in [docs/setup-and-deploy.md](docs/setup-and-deploy.md).

## Checks

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm eve:build
```

Without Docker, `pnpm eve:build` uses the `just-bash` sandbox provider, which is a devDependency, so it works after `pnpm install`.

## Documentation

- [How the chatbot works](docs/how-the-chatbot-works.md): chat hook, persistence, legacy chats, allowlist, media, secrets, shell.
- [Setup and deployment](docs/setup-and-deploy.md): env vars, migrations, Blob, Hobby notes, owner checklist.

## Agent code

Edit the agent in `agent/agent.ts`. Its behavior is defined in `agent/instructions.md`, and tools live in `agent/tools/`. Tools never take a brand id as input. They read the brand from the verified `auth.attributes`. Read the guides in `node_modules/eve/docs/` before changing eve code.
