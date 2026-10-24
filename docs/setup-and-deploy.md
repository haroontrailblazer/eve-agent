# Setup and Deployment

This guide covers local development, environment variables, Vercel Blob, the sign-in allowlist, the encryption key, database migrations, Vercel Hobby limits, deployment, and the owner verification checklist for harpy.

## Prerequisites

- Node.js 24 or newer
- pnpm through Corepack
- A Vercel account with access to the team that owns the project
- Vercel CLI, either installed globally or run with `pnpm dlx`

```bash
corepack enable
pnpm install
pnpm dlx vercel@latest login
```

The commands below use `vercel`. If you do not have a global install, replace `vercel` with `pnpm dlx vercel@latest`.

## Environment Variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | yes | Neon Postgres. |
| `BETTER_AUTH_SECRET` | yes | Better Auth signing secret. |
| `NEXT_PUBLIC_VERCEL_APP_CLIENT_ID` | yes | Sign in with Vercel client id (public). |
| `VERCEL_APP_CLIENT_SECRET` | yes | Sign in with Vercel client secret. |
| `HARPY_OWNER_EMAIL` | yes | The owner's email. Always allowed to sign in. |
| `HARPY_ALLOWED_EMAILS` | no | Extra allowed emails, comma-separated. |
| `SOCIAL_TOKEN_ENCRYPTION_KEY` | yes | 32 random bytes, base64. Encrypts stored MCP tokens and OAuth state. |
| `BLOB_READ_WRITE_TOKEN` | for images | Token for a public Vercel Blob store. Required for images and uploads; chat works without it. |
| `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `KV_REST_API_URL`, `KV_REST_API_TOKEN` | yes | Rate limiting. |
| `AI_GATEWAY_API_KEY` | local only | Model access in local development. Alternatively use `VERCEL_OIDC_TOKEN` from `vercel env pull`. |
| `BETTER_AUTH_URL` | no | Override the app origin for a custom domain. |
| `SLACK_CONNECTOR`, `LINEAR_CONNECTOR`, `NOTION_CONNECTOR`, `SENTRY_CONNECTOR` | no | Vercel Connect connector UIDs. |

`.env.example` lists the harpy variables with a one-line comment each.

## Allowlist

harpy is private. Only `HARPY_OWNER_EMAIL` and the emails in `HARPY_ALLOWED_EMAILS` can sign in. Matching ignores case and surrounding spaces.

```bash
printf '%s' "owner@example.com" | vercel env add HARPY_OWNER_EMAIL production preview development
printf '%s' "a@example.com,b@example.com" | vercel env add HARPY_ALLOWED_EMAILS production preview development
```

An email that is not allowed never gets an account. The owner must sign in once before other allowed emails can use harpy, because the owner's brand is created at the owner's first sign-in.

## Encryption Key

`SOCIAL_TOKEN_ENCRYPTION_KEY` encrypts MCP tokens and OAuth state before they are stored in Postgres.

```bash
openssl rand -base64 32
printf '%s' "<generated-key>" | vercel env add SOCIAL_TOKEN_ENCRYPTION_KEY production preview development
```

Warning: rotating or losing this key makes every stored secret unreadable. Those connections show as "Needs reconnect" under Tools on the Channels page, and asking harpy to connect one again replaces its unreadable secrets. Until a connection is reconnected, setting the old key back restores it. Keep a copy in your password manager.

## Vercel Blob

Images are stored on a public Vercel Blob store. In the Vercel dashboard, open Storage, create a Blob store with public access, and connect it to the project. That sets `BLOB_READ_WRITE_TOKEN`, which is needed for images and uploads (chat works without it). Then pull it locally:

```bash
vercel env pull .env.local --yes
```

Image URLs are unguessable but public, so do not put private images in this store.

## Local eve build

`pnpm eve:build` initializes the eve sandbox template. On a machine without Docker it falls back to the `just-bash` provider, which needs the `just-bash` package. harpy does not depend on it, so the build fails with "The just-bash sandbox provider requires the `just-bash` package". Skip the sandbox prewarm instead:

```bash
pnpm exec eve build --skip-sandbox-prewarm
```

Builds on Vercel and on machines with Docker use `pnpm eve:build` unchanged.

## Local Project Link

Create or select the Vercel project that will run this template:

```bash
vercel link
```

If you are working in a team, pass the team scope:

```bash
vercel link --scope <team-slug>
```

## Required Storage

Neon and Upstash Redis are required for the template.

Provision Neon:

```bash
vercel integration add neon
```

Provision Upstash Redis:

```bash
vercel integration add upstash
```

Follow the prompts and connect both resources to the linked project.

When Neon is created through the import flow, `DATABASE_URL` is usually marked sensitive and applied to Production and Preview. That is fine for deployed migrations with `vercel env run`. Select Development for the Neon env var only if you want `DATABASE_URL` to be pulled into `.env.local`; selecting Development will make it available to local dev.

Pull local env vars if you are running the app locally:

```bash
vercel env pull .env.local --yes
```

## Better Auth Secret

Generate a production-safe secret:

```bash
openssl rand -base64 32
```

Add it to every Vercel environment:

```bash
printf '%s' "<generated-secret>" | vercel env add BETTER_AUTH_SECRET production preview development
```

Pull the value locally if needed:

```bash
vercel env pull .env.local --yes
```

## Sign in with Vercel

Create a Vercel App / OAuth client in the Vercel dashboard for the account or team that owns the project. Start with the [Sign in with Vercel prerequisites](https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites).

Required scopes:

```text
openid
email
profile
```

In the Vercel App dashboard UI, open the app's scopes/permissions settings and toggle all three scopes on. These are Vercel App permissions, not environment variables.

The email scope is mandatory. Without it, Better Auth redirects to:

```text
/auth/error?error=email_not_found
```

Add callback URLs for every origin you will use:

```text
http://localhost:3000/api/auth/callback/vercel
http://localhost:3001/api/auth/callback/vercel
https://<your-project-production-domain>/api/auth/callback/vercel
https://<your-custom-domain>/api/auth/callback/vercel
```

Use the `3001` callback only if you run local dev on port 3001. Add custom-domain callbacks only after you know the domain.

Copy the Vercel App client ID and client secret, then add them:

```bash
printf '%s' "<client-id>" | vercel env add NEXT_PUBLIC_VERCEL_APP_CLIENT_ID production preview development
printf '%s' "<client-secret>" | vercel env add VERCEL_APP_CLIENT_SECRET production preview development
```

Pull the updated values locally:

```bash
vercel env pull .env.local --yes
```

`NEXT_PUBLIC_VERCEL_APP_CLIENT_ID` is intentionally public. `VERCEL_APP_CLIENT_SECRET` and `BETTER_AUTH_SECRET` must stay secret.

You can create the OAuth app from the CLI:

```bash
vercel oauth-apps register \
  --name "harpy" \
  --slug "harpy" \
  --redirect-uri "https://<your-project-production-domain>/api/auth/callback/vercel"
```

After using the CLI, verify scopes and the client secret in the Vercel dashboard before relying on sign-in. See the [OAuth Apps CLI docs](https://vercel.com/docs/cli/oauth-apps).

## App URL

The app derives the auth origin in this order:

```text
BETTER_AUTH_URL -> VERCEL_PROJECT_PRODUCTION_URL -> VERCEL_URL -> http://localhost:3000
```

You usually do not need `BETTER_AUTH_URL` for the first Vercel deployment. Set it explicitly when you use a custom production domain:

```bash
printf '%s' "https://<your-custom-domain>" | vercel env add BETTER_AUTH_URL production preview development
```

`VERCEL_PROJECT_PRODUCTION_URL` and `VERCEL_URL` are Vercel system env vars. See [system environment variables](https://vercel.com/docs/environment-variables/system-environment-variables).

## Database Migrations

Phase 1 adds four migrations under `lib/db/migrations`:

| Migration | What it does |
| --- | --- |
| `0006_chat_eve_082` | Adds `chat.legacy` and `chat_event.eve_event_id` with a unique index on `(chat_id, eve_event_id)`. |
| `0007_mark_legacy_chats` | Marks every existing chat that has a session or events as legacy (read-only) and clears its session and pending message. |
| `0008_harpy_brands` | Adds `brand`, `brand_member` and `channel_identity`. |
| `0009_media_assets` | Adds `media_asset`. |

They are generated but not applied until you apply them. `0007` rewrites existing chat rows, so back up first: create a Neon branch of the production database (Neon console, Branches, Create branch) and keep it until you have checked the app.

Apply locally. This uses `DATABASE_URL` from `.env.local`, so check that it does not point at production:

```bash
set -a
source .env.local
set +a
pnpm db:migrate
```

Apply to production, after the backup:

```bash
pnpm db:migrate:production
```

`pnpm db:migrate:production` runs `vercel env run -e production -- pnpm db:migrate`. For local prototyping only, `pnpm db:push` syncs the schema without migrations. Do not use it against production.

See the [Vercel env run docs](https://vercel.com/docs/cli/env) for more examples.

## Vercel Hobby notes

- Do not add eve `defineSchedule` files. Hobby fails deploys on cron schedules that run more often than daily.
- eve runs on Vercel Workflow, which has a budget of 50,000 events a month on Hobby. The web chat uses `followIdle: false` so a settled turn does not keep a stream attached.
- If chat stops working near the end of a month, check the Workflow usage in the Vercel dashboard.

## Local Development

```bash
pnpm install
vercel env pull .env.local --yes
pnpm db:migrate
pnpm dev
```

The agent needs model access. Either set `AI_GATEWAY_API_KEY` in `.env.local`, or rely on the `VERCEL_OIDC_TOKEN` that `vercel env pull` writes. It expires, so pull again when model calls start failing with auth errors. Also set `HARPY_OWNER_EMAIL` and `SOCIAL_TOKEN_ENCRYPTION_KEY` in `.env.local`, and `BLOB_READ_WRITE_TOKEN` if you want images and uploads.

Checks:

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm exec eve build --skip-sandbox-prewarm
```

## Run Locally

Start the app:

```bash
pnpm dev
```

Or run it on port 3001:

```bash
PORT=3001 pnpm dev -p 3001
```

Open the matching local URL and make sure the Vercel App contains the same callback URL.

## Optional Vercel Connect Integrations

Slack, Notion, Linear, and Sentry are optional.

Create any connectors you want to use:

```bash
# Slack channel
vercel connect create slack --name eve-chat-template --triggers
vercel connect attach <slack-connector-uid> --triggers --trigger-path /eve/v1/slack --yes

# MCP connections
vercel connect create mcp.notion.com --name notion
vercel connect create https://mcp.linear.app/mcp --name linear
vercel connect create https://mcp.sentry.dev/mcp --name sentry
```

Attach it to the linked Vercel project if needed:

```bash
vercel connect attach <connector-uid> --yes
```

Set the matching environment variable to each connector UID:

```bash
printf '%s' "<slack-connector-uid>" | vercel env add SLACK_CONNECTOR production preview development
printf '%s' "<connector-uid>" | vercel env add NOTION_CONNECTOR production preview development
printf '%s' "<connector-uid>" | vercel env add LINEAR_CONNECTOR production preview development
printf '%s' "<connector-uid>" | vercel env add SENTRY_CONNECTOR production preview development
vercel env pull .env.local --yes
```

For local development, the connections fall back to `slack/eve-chat-template`, `notion`, `linear`, and `sentry`, so local connectors created with the names above can work without editing files under `agent/`.

If a chat requires MCP authorization, use the Connect card in the chat UI. If you want to manage a connector directly, open the project integrations/settings page in Vercel and find the connector.

See [Deploy Button integrations](https://vercel.com/docs/integrations/deploy-button/integrations) for how storage products are declared in the deploy URL.

## Deploy

Build locally before deploying:

```bash
pnpm build
```

Deploy to production only after the production migrations above are applied:

```bash
vercel --prod
```

After changing env vars, storage products, or Connect connectors, redeploy so production uses the newest project configuration.

## Troubleshooting

If chat is disabled and says setup is required, check the tooltip. Missing migrations will show as `database migrations`. Run:

```bash
pnpm db:migrate:production
```

If sign-in redirects to `/auth/error?error=email_not_found`, enable the email scope in your Vercel App. See [Sign in with Vercel scopes](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions).

If sign-in redirects to `/auth/error?error=invalid_scope`, make sure the Vercel App has `openid`, `email`, and `profile` enabled.

If sign-in redirects to an auth error after the OAuth consent screen, confirm that the callback URL exactly matches your browser origin, including port and `/api/auth/callback/vercel`.

If `pnpm db:migrate` says `DATABASE_URL` is missing, either run `pnpm db:migrate:production` for production or pull a Development-scoped Neon env var into `.env.local`.

If sign-in says harpy is private, add the email to `HARPY_ALLOWED_EMAILS` and redeploy.

If rate limiting setup is missing, provision Upstash Redis and pull env vars again.

If Notion tool calls fail, confirm that `NOTION_CONNECTOR` is set in Vercel, the connector is attached to the project, and local env vars have been pulled again.

## Owner Verification Checklist

These checks need real credentials (Better Auth, Blob token, encryption key, AI Gateway) and a migrated database, so they have not been run yet. Run them after applying migrations 0006 to 0009 locally. Tick an item only when you observe it.

### Chat parity (M1)

1. Home handoff: submitting from home navigates at once. The user bubble and "Thinking..." show, then the URL becomes `/chat/<uuid>` with no scroll jump.
2. Sidebar: the new chat appears at the top with a title taken from the first message. After each turn it moves back to the top.
3. Follow-ups: a follow-up shows an optimistic bubble, then streaming text, and the view sticks to the bottom.
4. Stop: while busy a Stop square shows. Stop ends the turn, keeps the partial answer and re-enables the composer.
5. Refresh mid-stream: history shows and the turn keeps streaming, with no duplicate messages. This query returns 0 rows:
   ```sql
   select chat_id, eve_event_id, count(*) from chat_event group by 1,2 having count(*) > 1;
   ```
6. Refresh after the turn finishes: the first message is not sent again.
7. Errors: a "Request failed" toast shows. Over the rate limit it shows "Retry in Ns."
8. Connections menu: the toggles change the context for the next turn.
9. Skills: the `/` skills menu works and the chosen skill's prompt is applied.
10. Attachments: image, PDF and long-paste attachments send. Thumbnails show this session and chips show after a reload.
11. Image editing: "Make the background blue" on an attached image calls `generate_image` and the result renders inline.
12. Tool groups: they show running, done and error states, with expandable input and result.
13. Reasoning: a collapsible shows "Thinking..." and then "Reasoning".
14. Notion sign-in: the Connect card shows and the composer is locked with "Connect Notion to continue this turn, or skip it." After OAuth the same turn resumes without sending again. Skip ends the wait and the composer works again.
15. `ask_question` (temporary): add `agent/tools/ask_question.ts` containing `import { askQuestion } from "eve/tools/ask_question"; export default askQuestion();`. Option buttons and freeform text work and the buttons disable after an answer. Delete the file afterwards.
16. Legacy chats: a chat from before the upgrade opens read-only with the older-version notice.

### Allowlist

- The owner email signs in.
- An email in `HARPY_ALLOWED_EMAILS` signs in after the owner has signed in once.
- Any other Vercel account is refused with the "harpy is private to its owner" message and no `user` row is created.
- Removing an email from `HARPY_ALLOWED_EMAILS` and redeploying locks that account out of chat.

### Blob images

- Attach a png under 20 MB. It uploads to Blob, and `select * from media_asset order by created_at desc limit 1` shows a row with your brand id and a `*.public.blob.vercel-storage.com` URL.
- Attach an image over 20 MB. It is refused with "Images must be 20 MB or smaller." and nothing is uploaded.
- Ask for a generated image. It renders inline and gets a `media_asset` row.
- Ask the agent to edit an image from an internal URL such as `http://localhost`. It is refused.

### Encrypted tokens

- Connect an OAuth MCP server (Notion).
- In Postgres, the new `mcp_connection` row has no readable token text: `oauth` is `{"box": ...}` and any `token` is an encrypted box.
- Disconnect and reconnect works.
- With a different `SOCIAL_TOKEN_ENCRYPTION_KEY`, Channels still lists the connection, marked "Needs reconnect", instead of "No tools connected yet". Asking harpy to connect it again succeeds and clears the mark.

### Pages and `/design`

- The sidebar shows Studio, Calendar, Inbox, Brief, Brand voice, Channels, Chat and Settings, and each page opens.
- `/profile` redirects to `/settings`.
- The sidebar collapse choice survives a reload with no flash (this is the `harpy-sidebar` cookie).
- `/design` renders every token and component in light and dark mode, and the theme setting on `/settings` switches modes.

## Useful Links

- [Vercel CLI](https://vercel.com/docs/cli)
- [Vercel env run](https://vercel.com/docs/cli/env)
- [Vercel Marketplace storage](https://vercel.com/docs/storage)
- [Vercel CLI integration commands](https://vercel.com/docs/cli/integration)
- [System environment variables](https://vercel.com/docs/environment-variables/system-environment-variables)
- [Sign in with Vercel prerequisites](https://vercel.com/docs/sign-in-with-vercel/getting-started#prerequisites)
- [Sign in with Vercel scopes](https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions)
