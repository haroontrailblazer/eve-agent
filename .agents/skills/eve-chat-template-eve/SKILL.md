---
name: eve-chat-template-eve
description: Work safely on eve-specific internals in harpy. Use when changing the eve agent, withEve routes, eveChannel auth, useEveAgent and useHarpyChat, persisted chat events, stream and resume behavior, connection authorization, Vercel Connect MCP connections, local eve tools, brand scoping, or upstream eve API assumptions.
---

# harpy eve runtime

## Overview

harpy is a private social media control room on eve 0.82 and Next.js 16. Use this skill to preserve the eve protocol and the durable-session invariants while changing the chat.

## First pass

- Read `AGENTS.md` first. It requires reading the relevant guide under `node_modules/eve/docs/` before writing code.
- Read `docs/how-the-chatbot-works.md` for architecture changes and `docs/setup-and-deploy.md` for setup, auth, storage or deployment changes.
- Search with `rg "useEveAgent|useHarpyChat|eve_event_id|event_index|authorization.required|defineMcpClientConnection|defineTool|brandId"`.
- Keep eve runtime code separate from product shell code: `agent/` defines agent behavior; `app/_components/chat/use-harpy-chat.ts` bridges eve to the web UI; `lib/db/*` persists app state.

## Core model

- An app chat row and an eve session are different things. The row owns URL, title, owner, pending message, stored session and event rows. eve owns the remote durable session and its stream.
- `chat_event.event_index` orders local Postgres rows. It is not a stream cursor.
- Preserve the same-origin eve routes mounted by `withEve(nextConfig)`: `POST /eve/v1/session`, `POST /eve/v1/session/:sessionId` and `GET /eve/v1/session/:sessionId/stream`.
- Keep `betterAuthEveAuth`, `localDev()` and `vercelOidc()` in the eve channel unless deliberately changing local, browser or Vercel auth behavior.
- The web principal carries `attributes.brandId` from `lib/eve-auth.ts`. Tools read the brand from verified `auth.attributes` and never accept `brandId` or any tenant id as input.

## Hook-native chat rules

- Use `useEveAgent` from `eve/react` directly, with `initialEvents`, `initialSession`, `resume: chat.session !== undefined` and `followIdle: false`. Do not wrap it in a custom `ClientSession`, and do not add a continuation token or synthetic events.
- `useEveAgent` reads its options once, so mount the chat with `key={chat.id}`.
- Persist stream events from `onEvent` in batches. Dedupe by eve's `meta.id`, stored in `chat_event.eve_event_id` under a unique `(chat_id, eve_event_id)` index. The first occurrence of a repeated id wins.
- Save the session from `onSessionChange` only when the session id changes. `onSessionChange` fires on every accepted event.
- Finalize in `onFinish`, and only if this mount saw new events. A resume of an already settled turn must not reorder the sidebar.
- Auto-send the first message only through `shouldAutoSendPending`: local handoff marker present, chat not legacy, no session yet, non-empty pending message.
- A legacy chat (created before 0.82) is read-only and never sends.
- Skip and Connect go through the hook's `respond` and the authorization card. Never parse assistant text for auth requirements; use `authorization.required` and `authorization.completed` events.

## Streaming

- Treat `message.appended.data.messageDelta` as new text. Treat `messageSoFar`, reduced message text and rendered parts as cumulative.
- A turn is settled on `session.completed`, `session.failed` or `session.waiting`. `authorization.required` is a blocked state for normal text input.
- Do not split server events just to make coarse deltas look token-level. Smooth only at the UI layer.

## Connections and tools

- Define local tools in `agent/tools/<snake_case>.ts` with `defineTool(...)`. The filename becomes the tool name, so keep it ASCII snake_case.
- Define Vercel Connect MCP connections in `agent/connections/<name>.ts` with `defineMcpClientConnection(...)` and `connect(process.env.ENV_NAME ?? "local-name")`.
- Composer connection toggles are per-turn intent, not provisioning or OAuth state.
- MCP tokens and OAuth state are encrypted with `SOCIAL_TOKEN_ENCRYPTION_KEY`. Never write a secret to Postgres in plaintext.
- Add no eve `defineSchedule` files (Vercel Hobby fails deploys on crons that run more than once a day).
- Never set `temperature`, `top_p` or `top_k`, and never use reasoning `"none"` or `"minimal"` with Opus models.

## Upstream signals

- Prefer upstreaming generic eve lifecycle needs. Keep harpy-specific concerns in harpy: Better Auth and the allowlist, the Neon and Drizzle schema, Upstash limits, brands, Blob media and setup docs.

## Verification

- Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Run `pnpm eve:build` too, or `pnpm exec eve build --skip-sandbox-prewarm` on a machine without Docker.
- For chat changes, walk checklist M1 in `docs/setup-and-deploy.md` (first message, follow-up, refresh mid-stream, stop, authorization Connect and Skip, attachments, image generation and editing, legacy chats).
