# How the Chatbot Works

harpy is a Next.js 16 app on the eve agent framework (eve 0.82). This document explains how the web chat is put together, how it persists and resumes, who may sign in, and where media and secrets live. Read the guides in `node_modules/eve/docs/` before changing anything that touches eve.

## Main Pieces

| Path | Purpose |
| --- | --- |
| `agent/agent.ts` | Defines the eve agent (model, reasoning, session budget). |
| `agent/instructions.md` | The harpy system prompt. |
| `agent/channels/eve.ts` | The eve web channel and its auth adapters. |
| `agent/channels/slack.ts` | The Slack channel through Vercel Connect. |
| `agent/connections/*.ts` | Vercel Connect MCP connections (Notion, Linear, Sentry, DeepWiki). |
| `agent/tools/*.ts` | Local tools, including `generate_image` and the MCP and skill tools. |
| `next.config.ts` | Wraps the app with `withEve(nextConfig)`, which mounts the `/eve/v1/*` routes. It also redirects `/profile` to `/settings`. |
| `app/(app)/layout.tsx` | The control-room shell for every page. |
| `app/(app)/*` | The pages: Studio (`/`), calendar, inbox, brief, brand-voice, channels, chat, settings and design. |
| `app/_components/app-shell.tsx` | Client shell: sidebar state, chat history, auth modal, shared chat context. |
| `app/_components/home-chat-page.tsx` | Chat home composer. Hands the first message to a provisional chat and navigates into it. |
| `app/_components/session-chat-page.tsx` | Creates a provisional chat's row, loads one chat and decides whether to auto-send its first message. |
| `app/_components/chat/use-harpy-chat.ts` | The chat hook: `useEveAgent` plus persistence and finalization. |
| `app/_components/chat/chat-session.tsx` | Renders one live chat. |
| `app/_components/chat/legacy-chat-view.tsx` | Read-only view for legacy chats. |
| `components/chat/*` | Messages, markdown, composer, authorization card, integrations menu. |
| `components/ui/*` | shadcn primitives. |
| `components/harpy/*` | harpy domain components (page header, empty state, platform chip, draft card and similar). |
| `agent/tools/draft_posts.ts`, `revise_draft.ts`, `propose_schedule.ts`, `list_drafts.ts` | The drafting tools. None of them can approve or publish. |
| `agent/subagents/writer/` | The writer subagent (Opus, reasoning high, tools off). |
| `lib/drafts/*` | Drafting: input, orchestration, steps, lint, store, state machine, writer messages. |
| `lib/review.ts` | Approve, skip, restore, edit and revision writes, each one guarded SQL statement. |
| `lib/studio/*` | Studio snapshot, view model, keyboard map and the "Studio request:" protocol. |
| `lib/voice/*`, `agent/memory/voice.ts`, `agent/instructions/brand-voice.ts` | Brand voice guide, examples, preferences, recall and the injected guide. |
| `evals/*`, `lib/eval-auth.ts` | Drafting evals and the local owner sign-in they use. |
| `app/actions/chat.ts` | Server actions for chat creation, event persistence, session save, finalize, rate checks. |
| `app/api/media/upload/route.ts` | Token endpoint for direct browser uploads to Vercel Blob. |
| `lib/db/schema.ts` | Drizzle tables. |
| `lib/db/queries.ts` | Chat list, load, event append, session save, finalize, delete. |
| `lib/chat/*` | Pure chat helpers (event rows, derived view, legacy reducer, chat load, auto-send rule). |
| `lib/allowlist.ts`, `lib/brand-access.ts` | Who may sign in and which brand they act for. |
| `lib/media/*` | Blob storage, upload limits, SSRF-safe source image loading. |
| `lib/crypto/secret-box.ts` | Encryption for stored secrets. |
| `lib/app-origin.ts` | The single place that decides the app origin. |

## The Chat Hook

The browser talks to eve through same-origin routes mounted by `withEve`: `POST /eve/v1/session`, `POST /eve/v1/session/:sessionId` and `GET /eve/v1/session/:sessionId/stream`. `useHarpyChat` wraps eve's `useEveAgent` from `eve/react`:

```ts
useEveAgent({
  followIdle: false,
  initialEvents: chat.events,
  initialSession: chat.session,
  resume: chat.session !== undefined,
  onEvent, onSessionChange, onFinish, onError,
});
```

- `initialEvents` and `initialSession` come from Postgres. `useEveAgent` reduces the saved events into messages and, because `resume` is true, reattaches to the live stream if a turn was still running.
- `useEveAgent` reads its options once, so the chat component is mounted with `key={chat.id}`.
- `followIdle: false` keeps the stream from staying attached after a turn settles. This matters on Vercel Hobby, where the Workflow events budget is limited (see [Vercel Hobby notes](setup-and-deploy.md#vercel-hobby-notes)).
- There is no custom `ClientSession`, no continuation token and no synthetic events. The hook uses only what eve 0.82 provides.

### Sending

`send(text, attachments)` runs these steps in order:

1. Route every attachment through `lib/media/attachment-policy.ts`. Supported images (png, jpeg, webp, gif up to 20 MB) go to Blob. Other files stay inline as data URLs up to 3 MB. A refused file leaves no trace.
2. Check the send rate limit (`checkSendLimitAction`).
3. Mark the pending message on the chat row, which bumps the chat in the sidebar and titles a new chat from its first message.
4. Upload Blob-bound images straight from the browser through `/api/media/upload`, then record them (`recordUploadedMediaAction`). The agent gets the hosted URL, because a tool cannot read attached bytes.
5. Call `useEveAgent`'s `send` with the message content and a per-turn `clientContext` built from the connection toggles, hosted image URLs and any `/skill` the user picked. If the chat is already busy the turn policy is `steer`.

`respond` answers authorization and input requests. `cancel` stops the turn.

### Persistence

- **Events.** `onEvent` buffers each stream event with a local `index` and flushes the batch 300 ms after the stream goes quiet, through `appendChatEventsAction`. A failed batch is kept and retried on the next flush. The index starts at the chat's `nextEventIndex`, one past the highest saved `event_index` (0 for a new chat), not at the number of saved events, so a gap in the log never makes a new event reuse a taken index.
- **Dedupe by `meta.id`.** eve stamps every event with `meta.id`. `chat_event.eve_event_id` stores it, and a unique index on `(chat_id, eve_event_id)` makes a replayed event a no-op. `toChatEventRows` keeps the first occurrence of a repeated id. Events with no id (older streams) are stored with a null `eve_event_id`.
- **Order by `event_index`.** `chat_event.event_index` orders rows when a chat loads. It is a local position in the saved log. It is not an eve stream cursor, and the two must not be mixed up.
- **Session.** `onSessionChange` fires on every accepted event, so the hook saves the session (`saveChatSessionAction`) only when the session id changes.
- **Session.** Saving the session (`saveChatSession`) also clears the chat's pending message, because once a session exists the first message has been sent.
- **Finalize.** `onFinish` flushes pending events and calls `finalizeChatTurnAction`, which saves the final session cursor and moves the chat to the top of the sidebar. A resume that finds an already settled turn brings no new events, so it does not finalize and does not reorder old chats.
- On unmount the hook flushes whatever is buffered.

### First message handoff

Chat home does not create the chat row. It writes the first message as a local handoff marker to `sessionStorage` (plus pending attachments under `harpy-pending-attachments:<chatId>`) for a provisional id, and navigates to `/chat/new-<uuid>`. There `session-chat-page` calls `createChatAction`, which creates the row with the pending first message, moves the marker and attachments to the real id, and replaces the URL with `/chat/<id>`. `session-chat-page` then reads and clears the marker once per chat. `shouldAutoSendPending` (`lib/chat/auto-send.ts`) sends the first message only when all of these hold:

- the marker is present in this tab;
- the chat is not legacy;
- the chat has no eve session yet;
- the pending message is not empty.

Server data alone is never enough. A stale copy of the page (router cache, back and forward) still shows a pending message with no session, and sending it again would start a second eve session.

### Refresh and resume

`session-chat-page` builds the chat only from a no-store fetch of `/api/chats/:id`, never from the page's server render. On back and forward Next can reuse the first visit's cached render, which has no session and no events, and a chat built from it would start a second eve session. `reduceChatLoad` (`lib/chat/chat-load.ts`) settles on the first fetched chat, once. If the fetch fails, the composer says so and nothing is built.

On refresh, the page loads the chat's saved events and session. If a turn was still running, `resume: true` reattaches to the stream and only new events arrive. Because events are deduped by `meta.id`, nothing is duplicated. Refreshing after a turn finished shows history and sends nothing.

### Authorization

When a connection (for example Notion) needs sign-in, eve emits `authorization.required` and the conversation shows an authorization card. The composer is locked until the user connects or skips. After OAuth, the same turn resumes without sending again. Skip calls `cancel()`, which stops the waiting turn; it does not go through `respond`. The app never parses assistant text to detect auth requirements.

## Legacy Chats

Chats created before the eve 0.82 upgrade stored events in a format that may not reduce cleanly. Migration `0006_chat_eve_082` adds `chat.legacy` and `chat_event.eve_event_id`. Migration `0007_mark_legacy_chats` flags every existing chat that has a session or any events, and clears their `eve_session` and pending message.

A legacy chat opens read-only in `legacy-chat-view.tsx`, with a notice that it was started on an older version. `reduceLegacyEvents` folds the saved events into messages and returns `null` instead of throwing if they no longer reduce. Legacy chats never send and never auto-send.

## Auth, Allowlist and Brands

harpy is private. Sign in uses Better Auth with Sign in with Vercel.

- `HARPY_OWNER_EMAIL` is always allowed. `HARPY_ALLOWED_EMAILS` adds more people as a comma-separated list. Both are trimmed and lowercased (`lib/allowlist.ts`).
- `lib/auth.ts` gates account creation and session creation on `isEmailAllowed`, so an email that is not allowed never gets an account.
- `lib/eve-auth.ts` converts a Better Auth session into an eve principal and throws a forbidden error when the email is not allowed. The principal carries `attributes.brandId`, `channel: "web"`, `email` and `name`.
- Tools never accept `brandId` or any tenant id as input. They read the brand from the verified `auth.attributes`.
- Migration `0008_harpy_brands` adds `brand`, `brand_member` and `channel_identity`. `lib/brand-access.ts` finds the viewer's brand. The owner's brand is created on first sign-in. Other allowed emails join it as members only after the owner has signed in once.
- `lib/app-origin.ts` is the single source of the app origin, used by auth, metadata, the MCP OAuth `redirect_uri` and hosted image URLs. Order: `BETTER_AUTH_URL`, `VERCEL_PROJECT_PRODUCTION_URL`, `VERCEL_URL`, `http://localhost:3000`.
- `agent/channels/eve.ts` allows the Better Auth adapter, `localDev()` and `vercelOidc()`.

## Media on Blob

Images live on a public Vercel Blob store (`BLOB_READ_WRITE_TOKEN`, optional: chat works without it, images and uploads do not). Each object has a `media_asset` row (migration `0009_media_assets`) recording its brand.

- **Uploads.** The browser uploads supported images directly with `@vercel/blob/client` through `/api/media/upload`, then records them with a server action. Large images never travel in the chat request.
- **Generated images.** `generate_image` stores results with `saveMediaAsset` under `media/<id>.<ext>`. If the row cannot be written, the Blob object is deleted so nothing is orphaned.
- **Source images.** When a tool loads an image from a URL (for editing), `lib/media/source-url.ts` checks it against an allowlist first, to prevent SSRF. Only two kinds of URL pass: harpy's own `/api/images/<uuid>` route and public Vercel Blob URLs over https on the default port. Everything else is refused, including other hosts, internal addresses, URLs with credentials, and `data:` and `file:` URLs. `lib/media/load-source-image.ts` loads only what passes, and refuses redirects.
- **Limits.** `lib/media/limits.ts` is shared by the composer, the upload route and the loaders: images up to 20 MB, other attachments up to 3 MB inline, 50 generated images per day.
- Older images from before Blob are still served by `/api/images/[id]`.

## Secrets at Rest

MCP access tokens and OAuth state are encrypted with `SOCIAL_TOKEN_ENCRYPTION_KEY` (32 random bytes, base64) before they reach Postgres. `lib/crypto/secret-box.ts` does the encryption. `lib/db/mcp-secrets.ts` stores the OAuth state as `{ box }`, and `lib/db/mcp.ts` decrypts for the caller. Rows written before encryption still read as plaintext.

If the key is rotated or lost, stored secrets cannot be decrypted. `lib/db/mcp.ts` then returns those fields as null with `secretsUnreadable` set, never the ciphertext, so the rest of the list still loads. Channels marks the connection "Needs reconnect", and connecting it again clears the unreadable secrets and starts fresh. A read never clears anything, so setting the old key back restores a connection that has not been reconnected. Anything stored with the `v1:` box prefix is treated as a box: a damaged one fails to open instead of passing for a legacy plaintext secret.

## Shell and Sidebar

The shell is the control-room layout in `app-shell.tsx` with the shadcn sidebar (`components/ui/sidebar.tsx`). Sections are defined in `lib/nav.ts`: Studio, Calendar, Inbox, Brief, Brand voice, Channels, Chat and Settings. `/profile` redirects to `/settings`. `/design` is the reference page for every token and component in light and dark mode.

Two sidebar cookies exist, and only one matters:

- `harpy-sidebar` (`lib/sidebar-hint.ts`) is the one harpy uses. The shell layout renders statically, so the server cannot read cookies. A script in `<head>` reads `harpy-sidebar` before first paint and sets `html[data-harpy-sidebar="collapsed"]`, and CSS in `app/globals.css` collapses the desktop sidebar from that attribute. `AppShell` then reads the same cookie into React state and writes it on every toggle.
- `sidebar_state` is written by the shadcn `SidebarProvider`, but `AppShell` renders it as a controlled component (`open` and `onOpenChange`) and nothing in harpy reads `sidebar_state`. Ignore it.

## Theme and Design Tokens

The theme preference (system, light or dark) is handled by `components/theme-provider.tsx` and `lib/theme.ts`, and is set on `/settings`. Design tokens (silver palette, type scale, status and platform glyph colors) are in `app/globals.css` and shown on `/design`. Functional color appears only as glyphs and dots, never as surface fills.

## Setup Readiness

`lib/setup.ts` checks Neon, migrations, auth and Redis. The shell shows setup state and disables chat with a tooltip when something is missing. Missing migrations show as `database migrations`.

## Rate Limiting

`lib/rate-limit.ts` uses Upstash Redis fixed windows. `checkSendLimitAction` runs before every send and every authorization response. Agent session usage is capped by `lib/agent-limits.ts` through `limits.sessionUsage` in `agent/agent.ts`.

## Rendering Messages

`components/chat/message.tsx` renders eve messages: markdown through Streamdown, collapsible reasoning, tool groups with running, done and error states, authorization cards and input requests. `deriveChatView` (`lib/chat/derive.ts`) turns the conversation and status into the flags the UI needs (busy, resuming, awaiting authorization).

## Errors

Errors surface as Sonner toasts (`components/ui/sonner.tsx`). The hook calls `onError` with a message for failed saves, refused attachments, rate limits, upload failures and `turn.failed` events. A `MODEL_CALL_FAILED` turn shows "The model is temporarily unavailable. Please try again."

## Drafting

Studio turns an idea into reviewable drafts. Nothing is published. Approve marks a draft approved and it waits in Studio.

### From idea to drafts

1. **Studio request.** The idea composer saves the idea (`createIdeaAction`) with its platforms and any reel script or carousel pieces. The browser then starts a harpy session with a message that begins "Studio request:" (`lib/studio/requests.ts`, `lib/studio/start-run.ts`). The message names the tool call and carries the idea id, not the idea text. Up to 3 links in the idea are listed so the agent reads them with `web_fetch` and passes the text as sources.
2. **Browser session.** `startHarpyRun` uses the eve `Client` with the signed-in browser session, like chat does, and returns as soon as the server accepts the message. It never awaits the result. The agent instructions say to make exactly the named calls and reply in one short line.
3. **`draft_posts`.** A workflow tool. It takes an `ideaId`, or an `idea` and `sources` when asked from chat. A step (`prepareDrafting`) checks the 20 runs an hour limit, loads the idea, the voice guide, the preferences and the examples, and picks exemplars for each target. The brand comes from `resolveBrandContext(ctx)`, never from input. An idea created from chat shows in Studio as "via chat".
4. **The writer, in parallel.** The workflow body opens one `writer` session per target (X, LinkedIn, Threads, reel script, carousel outline) and runs them with `Promise.all`. Only those awaits sit in the body. Every database, clock and network call is a `"use step"` function in `lib/drafts/steps.ts`.
5. **Lint and repair.** `lib/drafts/lint.ts` checks each post: empty, too long (X counts a link as 23 characters), too many parts, banned phrases from the anti-AI guide, em dashes, links on X, too many links, too many cashtags, and hashtags (a warning only). Errors send one repair message in the same writer session. If the repair fails, the first output is kept with its remaining issues.
6. **Save and images.** Each draft is saved as revision 1 with its `draft_revision` row in one SQL statement. A target that already has a draft is skipped unless `redraft` is set. Images are then made in parallel, stored like `generate_image` images, and attached only if the draft is still on the revision the image was made for. A failed image never fails the draft. Without a Blob store no image is made or counted against the daily limit, and drafts save without images. An X draft with a link shows "includes a link · $0.20".
7. **Studio polling.** `/api/studio` returns a snapshot of ideas, drafts and approved drafts for the brand. `useStudioSnapshot` polls it every 4 seconds, so drafts appear as they land. Ideas tagged `eval` are left out.

One target failing never stops the others. The tool returns what it saved, what it skipped and what failed. When a run ends with failed targets, or the drafting limit refuses a saved idea, the idea's request is cleared (`clearIdeaRequested`), so Studio shows "Some drafts didn't come back." with Try again at once instead of "harpy is drafting" for 10 minutes. Try again marks the idea as requested again and drafts only the missing targets.

### Review without model turns

Approve, Skip, Restore, manual edits and "Ask harpy for a change" are server actions (`app/actions/studio.ts`). Approve, Skip and Restore never wake the model. Each write in `lib/review.ts` is a single guarded SQL statement that filters on `brand_id`, the draft's `revision` and the states the action may start from, and returns the new row. Approve and skip also carry the status the card showed. If the draft has moved on, no row changes and the user sees "That draft changed. Showing the latest.", so a second tab acting on an old card does nothing. A manual edit writes the draft and its `draft_revision` row in one statement, and puts the draft back in review.

No tool can approve, schedule or publish. `propose_schedule` only stores a suggested time (ISO 8601 with an offset) on a draft that is waiting for review. Suggested times show in the time zone set on Settings.

Studio keyboard shortcuts (`lib/studio/keyboard.ts`): J and K move, A approves, E edits, S skips and ? opens help. Keys are ignored while typing in an input, textarea, select or editable field, and with Cmd, Ctrl or Alt held.

### Revisions

"Ask harpy for a change" first marks the draft as having a revision request (guarded by its revision). It then sends a "Studio request:" that calls `revise_draft` with the draft id and the change. The tool checks the 40 revisions an hour limit and gives the writer the current text and the instruction. It lints and repairs the result, then saves a new revision, which returns the draft to review. A revision that is refused (the limit, a draft that is gone or can't be changed) or does not land (stale or failed) clears the request, so a card stops showing "harpy is refining" at once. The one exception is a run with no signed-in brand, which can't name the draft's brand; its card stops showing the request after 10 minutes. While a draft is being revised its card hides Approve and the A key does nothing, since the new revision would put it back in review. The image is kept unless `regenerateImage` is set. An X draft keeps a link it already has, and `allowLinksOnX` lets the owner ask for a new one.

### Brand voice

- **Guide.** `voice_guide` rows are versions. The active guide is added to every turn by `agent/instructions/brand-voice.ts`; if it fails to load, the turn goes on without it. Saving on the page, restoring an older version and `update_voice_guide` each add a new version. A save names the version it was based on, so two writers cannot overwrite each other.
- **Examples.** Past posts pasted on the Brand voice page are `voice_example` rows, and `list_voice_examples` reads them. "Rewrite from my examples" sends a "Studio request:" that has harpy read the examples and save a new guide version that keeps the default anti-AI rules.
- **Preferences.** Lasting rules such as "never use hashtags" are `voice_preference` rows, added on the page or by the agent through `voice__note_preference`. Every writer brief carries them.
- **Memory.** `agent/memory/voice.ts` is an eve memory scoped to the brand id. Each turn it recalls the preferences and up to 3 examples that best match the message (`lib/voice/exemplars.ts`). Recalled text is context, never instructions. eve may replay a recall with the same operation id and expects the same answer, so `lib/voice/recall-cache.ts` keeps the first outcome for a week in Redis, including a failed one, and rethrows aborts.
- **In drafts.** A writer brief carries the guide, the preferences and 4 exemplars chosen for that platform and idea.

### Evals

`evals/drafting/ideas.eval.ts` sends each idea in `evals/data/ideas.yaml` through the real agent and checks the platforms drafted, the lint gates and a judge score. `lib/eval-auth.ts` lets a local caller act as the owner when `HARPY_EVAL_AS_OWNER=1`, and does nothing when `NODE_ENV` is `production`. See [Running the evals](setup-and-deploy.md#running-the-evals).

## WhatsApp

WhatsApp is a second front door to the same agent. The channel is `agent/channels/whatsapp.ts`, served at `/eve/v1/whatsapp` through the Chat SDK adapter. That file only wires things up; the decisions live in `lib/whatsapp`. Setup is in the [WhatsApp setup runbook](whatsapp-setup.md).

### Inbound order

`planInbound` (`lib/whatsapp/inbound.ts`) decides what each message does, in this order:

1. **Link command.** `LINK <code>` redeems a code made on the Channels page. A stranger gets an answer only to a correct code. A wrong code gets a reply only if the sender is already linked.
2. **Unknown sender.** No linked identity means silence: no reply, no transcription, no typing indicator and no turn. A number in `HARPY_WHATSAPP_ALLOWED_NUMBERS` links itself to the owner on first contact (`lib/channel-auth.ts`).
3. **Rate limit.** 30 messages per 10 minutes per sender. The 31st gets one notice and later ones are ignored.
4. **Window.** The message reopens the 24-hour window (`wa:window:<number>`).
5. **Reset.** `/new` starts a fresh conversation. It goes through a route wrapper to eve's session reset, and the wrapper has not been run against a live session yet.
6. **Attachments.** Locations and stickers are dropped.
7. **Voice.** A voice note is transcribed with `openai/whisper-1` and the transcript becomes the message text. The agent is told it came from a voice note. If transcription fails, the sender is asked to type it.
8. **Edit target.** If an edit marker is waiting, or the message replies to one of harpy's cards, the draft is marked as having a revision request and the turn is told to call `revise_draft` and then `submit_for_review` for that draft only.
9. **Turn.** Everything else starts an eve turn as the owner principal, with the sender's number in `auth.attributes`.

Each reply is posted once, complete, because WhatsApp can't edit sent messages.

### Cards, buttons and the edit marker

Review cards bypass the Chat SDK. `lib/whatsapp/cards.ts` builds the Cloud API interactive messages and `lib/whatsapp/cloud-api.ts` sends them directly, so harpy gets the message id of every card, can put the draft's image in the header and controls the button ids. A card shows the draft text (an excerpt, with the full text sent just above it, when it is over 1,024 characters), the image when there is one, a footer such as "LinkedIn · 612 chars", and three buttons: Approve, Edit and Skip.

Button ids are `harpy:<verb>:<draftId>:<revision>`. The revision is how a stale tap is caught. Approve and Skip run the same guarded statements as Studio (`lib/review.ts`) with no model turn, and a tap on a card for an old revision gets "That draft changed. Showing the latest." and the current card. Each tap runs once (`wa:tap:<id>`, 24 hours), since WhatsApp redelivers and people double tap.

Edit does not wake the model. It stores an edit marker (`wa:edit:<number>`, 30 minutes, used once) and asks what to change. The next message, text or voice note, becomes the instruction. Replying to a card with text works as well.

### The outbox and the template fallback

Review delivery goes through the `notification` table (`lib/whatsapp/deliver.ts`), so a send is recorded and the same drafts aren't sent twice. If the 24-hour window is open, harpy sends the cards. If it is closed, or Meta rejects a card with error 131047, harpy sends the `harpy_drafts_ready` template instead, and its Review button sends the cards when tapped. Without Redis the window counts as closed, so templates are used. Each card sent is recorded in `wa_message_map`, which is how a reply to a card finds its draft and how a failed card finds its notification.

### The statuses wrapper

Delivery statuses (sent, delivered, read, failed) arrive on the same webhook, but the adapter ignores them. `lib/whatsapp/route.ts` wraps the channel's routes. For each POST it checks the same `X-Hub-Signature-256` HMAC the adapter checks, and only then reads statuses (`lib/whatsapp/statuses.ts`). A failed card with error 131047 triggers the template fallback once. Unsigned or wrongly signed bodies are passed to the adapter untouched, and the adapter answers 401.

### What is stored and where

- **Chat SDK history.** The Chat SDK keeps WhatsApp message history in Redis, bounded to 10 messages per sender for 1 hour. The typing indicator needs the latest inbound message. Text from a stranger therefore sits in Redis for up to an hour and then expires.
- **Sender mapping.** The WhatsApp adapter also keeps a small sender-id-to-route mapping in Redis for every sender, with no message text.
- **harpy's own keys.** `wa:window`, `wa:edit`, `wa:tap`, `wa:inbound` and the link code keys, all with short expiry.
- **Postgres.** Linked identities in `channel_identity`, plus `notification` and `wa_message_map` from migration `0011`.

### Slack identity

Slack runs on the same principal. A user makes a code with Link Slack on the Channels page and sends `LINK <code>` to harpy in a Slack DM (`lib/slack-auth.ts`). From then on that Slack user acts as the owner: drafts show as "via Slack" in Studio and Brand voice preferences apply. Approval prompts resumed in Slack keep the linked principal. Someone who isn't linked gets a hint to link in DMs and mentions, and silence elsewhere.

## Invariants

- harpy never replies to, transcribes for or starts a turn for a WhatsApp sender with no linked identity.
- A chat row is not an eve session. The row owns the URL, title, owner, pending message and stored session. eve owns the remote durable session.
- `chat_event.event_index` orders local rows. It is not a stream cursor.
- Dedupe events by `meta.id`. Never rely on `JSON.stringify` key order.
- A legacy chat never sends.
- The first message auto-sends only with the local handoff marker.
- Tools never take a brand id as input.
- No tool approves, schedules or publishes. Review actions are deterministic server code.
- No secret is written to Postgres in plaintext.
- Add no eve `defineSchedule` files (Vercel Hobby).

## Adding a Tool

Create `agent/tools/<snake_case>.ts` with `defineTool(...)`. The filename becomes the tool name, so keep it ASCII snake_case. Read the brand from `auth.attributes`, never from input.

## Adding a Connection

Create `agent/connections/<name>.ts` with `defineMcpClientConnection(...)` and `connect(process.env.ENV_NAME ?? "local-name")`. Add the toggle to `components/chat/integrations-menu.tsx` if users should control it per turn. Toggles are per-turn intent, not provisioning or OAuth state.

## Adding a Channel

Add `agent/channels/<name>.ts`. Keep channel auth explicit and map the channel's identity to a brand through `channel_identity`.

## Development Checklist

```bash
pnpm test
pnpm typecheck
pnpm build
pnpm eve:build
```

On a machine without Docker, `pnpm eve:build` uses the `just-bash` sandbox provider, a devDependency. See [Local eve build](setup-and-deploy.md#local-eve-build).
