# harpy Phase 3 (WhatsApp) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The owner talks to harpy on WhatsApp. A voice note, text, link or photo becomes drafts, and each draft comes back as a review card with Approve, Edit and Skip. Edit takes a typed or spoken change. Unknown numbers get silence. A notification that can't go out as a normal message goes out as an approved template. WhatsApp, Slack and the web all resolve to the same owner and brand.

**Architecture:**
- **One channel, thin.** `agent/channels/whatsapp.ts` wires eve's `chatSdkChannel` to the Chat SDK WhatsApp adapter. Every decision lives in testable modules under `lib/whatsapp/`:
  - `planInbound` decides what a message becomes: ignore, a reply, a session reset, or an eve turn with auth and context;
  - `handleHarpyAction` handles harpy's own buttons;
  - `wrapWhatsAppRoutes` reads delivery statuses before the adapter sees the webhook.
- **The model writes, plain code reviews.** Approve, Skip and Edit taps run `lib/review.ts` directly, with no model turn. Only the owner's reply to Edit starts a turn, and it carries a context line that points the agent at `revise_draft` and `submit_for_review`.
- **harpy's own sends use the Cloud API directly.** `lib/whatsapp/cloud-api.ts` sends review cards (image header, body, footer, three buttons), templates and short replies. Chat SDK cards can't carry an image header or a footer. Agent replies still go through the adapter, with a `message.completed` override that sends generated images as media.
- **Notifications go through an outbox.** `notifyDraftsReady` records one `notification` row per logical send (deduped), then sends at once:
  - review cards when the 24-hour window is open;
  - the `harpy_drafts_ready` template when it is closed, or when Meta rejects a card with error 131047.

  Delivery statuses that report 131047 later trigger the template once. Phase 4's dispatcher adds retries.
- **Identity is a table plus a code.** `channel_identity` maps a WhatsApp number or a Slack user to a harpy user and brand.
  - Numbers in `HARPY_WHATSAPP_ALLOWED_NUMBERS` link to the owner on first message.
  - Anyone else links by sending `LINK 123456`, with a code from the Channels page.
  - Every channel builds the same principal shape, so brand memory, voice and tools work everywhere.

**Tech Stack:** eve 0.82.0 (`chatSdkChannel`, `slackChannel` hooks, dynamic instructions and skills), Chat SDK 4.42.0 with `@chat-adapter/whatsapp`, `@chat-adapter/state-redis` and `@chat-adapter/state-memory`, WhatsApp Cloud API (Graph `v25.0`), AI SDK `transcribe` with `openai/whisper-1` through the AI Gateway, Next.js 16.2.6, Drizzle 0.45.1 on Neon (neon-http), Upstash Redis (REST for app keys, TCP `REDIS_URL` for Chat SDK state), `qrcode`, vitest 5.0.5.

**Spec:** `docs/superpowers/specs/2026-10-22-harpy-content-studio-design.md`. Read sections 3.1, 6 (Phase 3 row), 8.2, 8.3, 8.5, 8.7 (Outbox and Templates), 8.10 and 8.11. This plan implements Phase 3 on top of merged Phases 1 and 2 (`main` at `4a67327`).

**Research this plan rests on** (done 2026-10-25, in the session scratchpad; the facts that matter are restated in the tasks):
- `chat` and `@chat-adapter/*` 4.42.0 are what eve 0.82.0 vendors; 4.43.0 pins a different `chat`, so stay on 4.42.0.
- `createWhatsAppAdapter()` throws at call time without `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_VERIFY_TOKEN`. `createRedisState()` throws without a `redis://` or `rediss://` URL and can't use Upstash REST.
- The adapter's `editMessage` and `deleteMessage` throw a plain `Error`, which eve's `isNotImplemented` does not recognise.
- The adapter ignores `statuses` webhooks entirely. Message webhooks are deduped by message id (10 minutes); button taps and reactions are not.
- A reply-button tap's `ActionEvent.messageId` is the tap's own id. The tapped card's id is `event.raw.context?.id`. A quoted reply's id is `message.raw.message.context?.id`.
- Voice notes arrive as `type: "audio"` with text `"[Audio message]"` and an attachment `{ type: "audio", fetchData }`. Locations arrive as text plus a `{ type: "file", mimeType: "application/geo+json" }` attachment. Stickers arrive as `{ type: "image", name: "sticker" }`.
- Raw reply-button ids that don't start with `chat:` decode to `{ actionId: id, value: id }`. Template quick-reply taps arrive through the same `onAction` with `actionId` set to the button payload.
- In eve:
  - `send(content, { thread, auth, idempotencyKey, context })` is only callable inside a Chat SDK handler.
  - `context` is a `string[]` send option.
  - Tools have no channel or thread on `ctx`, so the channel and wa id travel in the auth attributes, whose values must be strings.
  - `from()` is not exported; `/new` needs a route wrapper.
  - Default Chat SDK concurrency is `"drop"`.

**eve docs to read before the matching task** (all under `node_modules/eve/docs/`):
- `channels/chat-sdk.mdx` and `channels/custom.mdx` (sections "Wrapping routes" and "Reset"), for Tasks 8 and 9;
- `channels/slack.mdx`, for Task 12, especially the four hooks and the allowlist example;
- `patterns/voice-notes.md`, for Task 7;
- `patterns/durable-cross-channel-notifications.md`, for Task 5;
- `guides/dynamic-capabilities.md` ("Dynamic skills", "Dynamic instructions"), `instructions.mdx` and `skills.mdx`, for Task 11;
- `sandbox/index.mdx` ("Inbound attachments"), for Task 10.

## Global Constraints

- **eve docs.** Read the relevant guide in `node_modules/eve/docs/` before writing code that touches eve.
- **Lowercase names.** Write "eve" and "harpy" in lowercase in UI copy, docs, prompts and comments.
- **Copy.** UI copy and WhatsApp replies use sentence case and straight quotes, with no em dashes or en dashes. WhatsApp reply copy lives in `lib/whatsapp/copy.ts` (Task 6), so tests and code share one source.
- **Versions.** Leave existing versions as they are: eve 0.82.0, next 16.2.6, react 19.2.6, drizzle-orm 0.45.1, drizzle-kit 0.31.9, zod 4.4.3, vitest 5.0.5, ai ^7.0.137. Add only these dependencies, pinned exactly (no caret):
  - `chat@4.42.0`
  - `@chat-adapter/whatsapp@4.42.0`
  - `@chat-adapter/state-redis@4.42.0`
  - `@chat-adapter/state-memory@4.42.0`
  - `qrcode@1.5.4`
  - dev: `@types/qrcode@1.5.5`

  If `@types/qrcode@1.5.5` doesn't exist, use the newest `1.5.x`.
- **Models.** Root and writer unchanged. Transcription is `openai/whisper-1` through the AI Gateway. Never set `temperature`, `top_p` or `top_k`.
- **No publish tool.** Approve marks a draft approved; publishing is Phase 4. No tool may approve, skip or publish.
- **Tenant and recipient ids.** Tools never accept `brandId`, `waId` or any recipient as input:
  - tools read the brand from `resolveBrandContext(ctx)`;
  - tools read `channel` and `waId` from `ctx.session.auth.current?.attributes`;
  - server actions use `getBrandIdForUser(viewer)`;
  - every query on brand data filters on `brand_id`.
- **Strangers get silence.** harpy never replies to, transcribes for, or starts a turn for a WhatsApp sender with no linked identity. The one exception is a correct `LINK` code. Don't mark their messages read or show typing to them.
- **Webhooks are verified.**
  - The adapter checks `X-Hub-Signature-256` for its own processing.
  - harpy's status handling (Task 8) verifies the same HMAC itself before acting.
  - Unsigned or wrongly signed bodies are passed to the adapter untouched; the adapter returns 401.
- **Button ids.**
  - Review buttons are `harpy:<verb>:<draftId>:<revision>`, with verb `approve`, `skip` or `edit`.
  - The template quick reply is `harpy:review:<ideaId>`.
  - Ids are at most 256 characters, and titles at most 20.
- **Graph API.** `https://graph.facebook.com/v25.0/<WHATSAPP_PHONE_NUMBER_ID>/messages`, with the `WHATSAPP_GRAPH_VERSION` constant (Task 1) equal to the adapter's default.
- **Tables.** Same rules as Phase 2:
  - every new table has `brand_id` (FK `brand.id`, cascade) and `timestamp(name, { withTimezone: true })`;
  - enums are `text` with `.$type<...>()`;
  - ids come from `randomUUID()`;
  - new tables are added to `REQUIRED_TABLES`.
- **Atomic writes.** neon-http has no transactions. Insert-once and claim writes are single statements, guarded with `on conflict ... do nothing` or a conditional `update ... returning`.
- **Redis keys** (Upstash REST through `getRedis()`). When Redis is missing:
  - the window counts as closed;
  - taps are processed without dedupe;
  - link codes are unavailable.

  | Key | Value | TTL |
  |---|---|---|
  | `wa:window:<waId>` | ISO time of the last inbound message or tap | 86,400 s |
  | `wa:edit:<waId>` | `PendingEdit` JSON | 1,800 s |
  | `wa:tap:<tapWamid>` | `"1"` | 86,400 s |
  | `wa:inbound:<waId>:<windowId>` | counter | 600 s |
  | `link:code:<channel>:<code>` | `{ userId, brandId }` JSON | 600 s |
  | `link:user:<channel>:<userId>` | the user's current code | 600 s |

- **Limits** (spec 8.10). These are new constants; use `enforceRateLimit` except where noted.

  | Constant | Value | Prefix | Keyed on |
  |---|---|---|---|
  | `WHATSAPP_INBOUND_PER_10_MIN` | 30 | own counter `wa:inbound` (Task 7) | waId |
  | `LINK_ATTEMPTS_PER_HOUR` | 5 | `"link:attempt"` | `<channel>:<externalId>` |
  | `LINK_ATTEMPTS_ALL_PER_HOUR` | 30 | `"link:attempt:all"` | `"all"` |
  | `LINK_CODES_PER_HOUR` | 10 | `"link:create"` | userId |

- **Vercel Hobby.**
  - Add no `defineSchedule`.
  - Webhook handlers finish well under 300 seconds: transcription and sends only, with drafting running in the eve session.
- **Tests.**
  - Tests live next to the module as `*.test.ts` under `lib/` or `components/`, and import from `"vitest"`.
  - DB modules mock `@/lib/db/client`. Raw SQL is asserted by rendering with `new PgDialect().sqlToQuery(...)`.
  - Redis is a fake returned from a mocked `@/lib/redis`.
  - Network calls take an injected `fetch`.
  - Nothing under `agent/` is unit-tested; agent files stay thin.
- **Checks.** `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm eve:build` pass at the end of every task that touches their inputs, and all four pass at the end of the plan.
- **Never run against production from this machine.** `.env.local` points at the production database and Redis. Don't run migrations, evals, the dev server, or any script that connects to them. The owner runs `! pnpm db:migrate:production`.
- **Commits.** Work on branch `harpy-whatsapp`, created from `main`, with at least one commit per task. End every commit message with the Co-Authored-By line of the model that wrote it, for example:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

## Review Focus

1. **The same tap or message twice.** Meta retries a webhook, or the owner double-taps Approve. The draft changes once and the owner gets one reply. Tests:
   - Task 6: a tap whose `claimTap` returns false changes nothing and sends nothing.
   - Task 5: a second `notifyDraftsReady` with the same drafts and revisions returns `duplicate` and sends nothing.
   - Task 9 review: the channel passes `idempotencyKey: message.id` to `send`.
2. **An old card.** Approve, Skip or Edit is tapped on a card whose draft was edited, approved or skipped somewhere else. Nothing changes, and the owner gets the failure message from `reviewFailureMessage`, plus the current card when the draft is still pending review. Tests in Task 6:
   - a revision mismatch gives a stale message and resends the card;
   - Skip on a skipped draft gives the invalid-state message and no card;
   - Edit on an old revision sets no marker.
3. **A stranger.** An unlinked number sends text, a voice note, a wrong `LINK` code, or taps an old button. harpy sends no reply, starts no turn, makes no transcription call, and writes nothing beyond rate-limit counters. Tests:
   - Task 7: `planInbound` returns `ignore` for an unknown sender, and `transcribe` is never called;
   - Task 7: a wrong code from an unknown sender is ignored;
   - Task 6: `handleIncomingAction` ignores a tap from an unknown sender;
   - Task 3: the sixth wrong code in an hour is refused.
4. **A closed window.** The notification goes out as the `harpy_drafts_ready` template:
   - when the window key is missing;
   - when the first card send fails with 131047;
   - when a `failed` status with 131047 arrives later, and then only once even if Meta repeats it.

   Tests in Tasks 5 and 8.
5. **The reply to Edit.**
   - After Edit, a `/new` or a `LINK` message doesn't use up the pending edit.
   - An expired marker means a normal turn.
   - A draft changed on the web between the tap and the reply gets the stale message and the latest card, with no turn.
   - A voice reply's transcript becomes the instruction.

   Tests in Task 7.

## Calls this plan makes, and what it leaves for later

**Choices where this plan departs from, or narrows, the spec:**
- **Review cards and templates bypass the Chat SDK.** They are sent with raw Cloud API calls, because Chat SDK cards drop image headers and footers and silently cut buttons past three. Agent replies still use the adapter.
- **The outbox flushes inline.** `notifyDraftsReady` sends right after it records the row. Phase 4's `outbox_flush` job adds retries.
  - The `notification` table keeps one `payload` column per kind, rendered at send time, instead of separate `service_payload` and `template_payload` columns. Drafts change between enqueue and send, so the payload stores ids, not text.
- **Phase 3's only notification is `drafts_ready`.** All seven templates are defined in code and created by the owner now, so Phases 4 and 5 need no new Meta step.
- **Studio gets "Send to WhatsApp"** on each idea with drafts waiting. This is Phase 3's source of notifications that can land outside the window, and it lets the owner review a desk idea on their phone.
- **Approve on WhatsApp only marks the draft approved.** The reply says it waits in Studio under Up next. "Scheduled for..." and "Posted to..." arrive with Phase 4.
- **Voice notes are transcribed in the channel, before the turn.** There is no `transcribe_audio` tool; a failure asks the owner to type instead. A transcript can then serve as an Edit instruction like any typed text.
- **`/new` uses a route wrapper with `AsyncLocalStorage`** to reach eve's `from(...).reset()`. This is unverified until the live check. If it fails there, remove the command (spec builder's call 11) and record that in the docs.
- **The owner's photo can be the post image.** The new `save_photo` tool stores a WhatsApp photo on Blob, and `draft_posts` takes `imageMediaId`. Drafts then use that photo and generate none.
- **A quoted reply to a review card is an edit request** for that draft. `wa_message_map` makes the lookup. Reactions are ignored.
- **Unlinked Slack users get a one-line hint** in DMs and mentions, because Slack replies are free. Unknown WhatsApp numbers get nothing.
- **No `ask_question` tool.** Nothing in Phase 3 needs it.

**Deferred work folded in** (memory "harpy deferred work"):
- WhatsApp buttons pass the shown status as `expectedStatus` (Task 6).
- Voice recall emits two keyed messages that replace themselves every turn, so a deleted preference stops applying in long WhatsApp sessions (Task 11).

**Left for later stages:**
- Phase 4:
  - retries through the `outbox_flush` job;
  - published, failed and reconnect notifications;
  - Slack review buttons;
  - skip and restore clearing `approved_at`;
  - stale images after a redraft.
- Phase 5: the brief, activity and weekly templates' senders, and "draft #2" from a brief.

## Prerequisites (owner actions; needed only for the live checks)

Unit tests, `pnpm typecheck`, `pnpm build` and `pnpm eve:build` need none of these.

- **P1. Meta app and test number.** Follow `docs/whatsapp-setup.md` (written in Task 14). It ends with the five `WHATSAPP_*` variables, `HARPY_WHATSAPP_ALLOWED_NUMBERS` and `HARPY_WHATSAPP_NUMBER` set in Vercel (production and preview), and the webhook pointing at production.
- **P2. Templates.** Create the seven templates in WhatsApp Manager with the exact wording from `lib/whatsapp/templates.ts`. Approval can take from minutes to a day, so submit them early.
- **P3. Redis TCP URL.** Check that `REDIS_URL` (or `KV_URL`) is set in production as a `rediss://` URL from the same Upstash database. Without it, Chat SDK state falls back to memory, which loses dedupe across instances.
- **P4. Migration.** Migration 0011 only adds tables, so it can run before the merge. The owner runs `! pnpm db:migrate:production`.

---

### Task 1: Dependencies, WhatsApp config and the adapter

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (the six dependencies in Global Constraints)
- Create: `lib/whatsapp/config.ts`, `lib/whatsapp/adapter.ts`
- Test: `lib/whatsapp/config.test.ts`, `lib/whatsapp/adapter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/whatsapp/config.ts
  export const WHATSAPP_GRAPH_VERSION = "v25.0";
  export type WhatsAppConfig = {
    readonly accessToken: string; readonly appSecret: string; readonly phoneNumberId: string;
    readonly verifyToken: string; readonly displayNumber: string | null; // HARPY_WHATSAPP_NUMBER, normalized
  };
  export function getWhatsAppConfig(env?: Env): WhatsAppConfig | null; // null unless all four WHATSAPP_* values are non-empty after trim
  export function isWhatsAppConfigured(env?: Env): boolean;
  export function normalizeWaNumber(value: string): string | null;     // digits only; 8 to 15 digits, else null
  export function getAllowedWhatsAppNumbers(env?: Env): readonly string[]; // HARPY_WHATSAPP_ALLOWED_NUMBERS, comma-separated, normalized, deduped, invalid dropped
  export function waMeLink(displayNumber: string, text: string): string; // https://wa.me/<digits>?text=<encodeURIComponent(text)>

  // lib/whatsapp/adapter.ts
  export function createHarpyWhatsAppAdapter(env?: Env): WhatsAppAdapter;
  export function createChatState(env?: Env): StateAdapter;
  ```
  `Env` is `Readonly<Record<string, string | undefined>>`, defaulting to `process.env`, as in `lib/allowlist.ts`.
- **The adapter factory:**
  - It passes every value explicitly to `createWhatsAppAdapter({ accessToken, appSecret, phoneNumberId, verifyToken, userName: "harpy" })`.
  - Any missing value is replaced by `unconfigured-${randomUUID()}`, so imports and `eve build` never throw, and an unconfigured webhook answers 401 or 403.
  - It then replaces the instance's `editMessage` and `deleteMessage` with functions that reject with an `Error` whose `name` is `"NotImplementedError"` and whose `code` is `"NOT_IMPLEMENTED"`.
- **The state factory:**
  - `url = env.REDIS_URL?.trim() || env.KV_URL?.trim()`.
  - When it starts with `redis://` or `rediss://`, return `createRedisState({ url, keyPrefix: "harpy-chat" })`. Otherwise return `createMemoryState()`.
  - Neither connects at construction.

- [ ] **Step 1: Add the dependencies.** Run `pnpm add chat@4.42.0 @chat-adapter/whatsapp@4.42.0 @chat-adapter/state-redis@4.42.0 @chat-adapter/state-memory@4.42.0 qrcode@1.5.4 --save-exact`, then `pnpm add -D @types/qrcode@1.5.5 --save-exact`.
  - Expected: `package.json` lists them without carets.
  - `pnpm why chat` shows a single `4.42.0`.
- [ ] **Step 2: Write `lib/whatsapp/config.test.ts`.**
  - `getWhatsAppConfig({})` is `null`. It is also `null` when any one of the four vars is `"  "`.
  - With all four set and `HARPY_WHATSAPP_NUMBER: "+1 (555) 123-4567"`, `displayNumber` is `"15551234567"`.
  - `normalizeWaNumber("+44 7700 900123")` is `"447700900123"`. `normalizeWaNumber("123")` and `normalizeWaNumber("abc")` are `null`.
  - `getAllowedWhatsAppNumbers({ HARPY_WHATSAPP_ALLOWED_NUMBERS: "+1 555 123 4567, 447700900123,bad,15551234567" })` equals `["15551234567", "447700900123"]`.
  - `waMeLink("15551234567", "LINK 123456")` is `"https://wa.me/15551234567?text=LINK%20123456"`.
- [ ] **Step 3: Write `lib/whatsapp/adapter.test.ts`.**
  - `createHarpyWhatsAppAdapter({})` does not throw, and its `name` is `"whatsapp"`.
  - `editMessage(...)` and `deleteMessage(...)` reject with errors for which `isNotImplemented(error)`, imported from `"eve/channels/chat-sdk"`, is `true`.
  - With `vi.mock("@chat-adapter/state-redis")` and `vi.mock("@chat-adapter/state-memory")`:
    - `createChatState({ REDIS_URL: "rediss://default:x@host:6379" })` calls `createRedisState` with `{ url: "rediss://default:x@host:6379", keyPrefix: "harpy-chat" }`;
    - `createChatState({ KV_URL: "redis://h:6379" })` uses that URL;
    - `createChatState({ REDIS_URL: "https://x.upstash.io" })` and `createChatState({})` call `createMemoryState`.
- [ ] **Step 4: Run them.** Run `pnpm vitest run lib/whatsapp`. Expected: FAIL, because the modules are missing.
- [ ] **Step 5: Implement both modules** to the interfaces above.
- [ ] **Step 6: Run the checks.** Run `pnpm vitest run lib/whatsapp` and `pnpm typecheck`. Expected: PASS, no errors.
- [ ] **Step 7: Commit.**
```bash
git add package.json pnpm-lock.yaml lib/whatsapp
git commit -m "feat(whatsapp): pin the chat sdk adapter, config parsing and a build-safe adapter"
```

---

### Task 2: Data model: outbox, message map and linked identities

**Files:**
- Modify: `lib/db/schema.ts` (tables `notification` and `wa_message_map`, plus their types)
- Create: `lib/db/migrations/0011_whatsapp.sql` via `pnpm db:generate --name whatsapp`, plus the generated `meta/` snapshot and journal
- Modify: `lib/db/client.ts` (add both tables to `REQUIRED_TABLES`)
- Create: `lib/notify/types.ts`, `lib/notify/store.ts`, `lib/db/channel-identities.ts`
- Test: `lib/notify/store.test.ts`, `lib/db/channel-identities.test.ts`

**Interfaces:**
- **Tables:**
  ```ts
  // notification: one row per logical notification; the outbox.
  id text pk; brand_id (brandIdColumn); channel text $type<"whatsapp"> not null; recipient text not null; // wa id
  kind text $type<NotificationKind> not null; dedupe_key text not null; payload jsonb $type<NotificationPayload> not null;
  status text $type<NotificationStatus> not null default 'pending'; delivery text $type<NotificationDelivery>;
  provider_message_id text; attempts integer not null default 0; last_error text; created_at, updated_at (tstz, defaultNow)
  // unique idx_notification_dedupe (dedupe_key); index idx_notification_brand_created (brand_id, created_at)

  // wa_message_map: which draft revision a sent WhatsApp message shows.
  id text pk; brand_id (brandIdColumn); wamid text not null; draft_id text not null references draft.id on delete cascade;
  revision integer not null; kind text $type<"card" | "full_text"> not null;
  notification_id text references notification.id on delete set null; recipient text not null; created_at tstz defaultNow
  // unique idx_wa_message_map_wamid (wamid); index idx_wa_message_map_draft (draft_id)
  ```
- **Types:**
  ```ts
  // lib/notify/types.ts
  export type NotificationKind = "drafts_ready";
  export type NotificationStatus = "pending" | "sent" | "failed";
  export type NotificationDelivery = "service" | "template";
  export type NotificationPayload = { readonly kind: "drafts_ready"; readonly ideaId: string; readonly drafts: readonly { readonly id: string; readonly revision: number }[] };
  export type NotificationRecord = {
    readonly id: string; readonly brandId: string; readonly channel: "whatsapp"; readonly recipient: string;
    readonly kind: NotificationKind; readonly dedupeKey: string; readonly payload: NotificationPayload;
    readonly status: NotificationStatus; readonly delivery: NotificationDelivery | null; readonly providerMessageId: string | null;
    readonly attempts: number; readonly lastError: string | null; readonly createdAt: string;
  };
  ```
- **Notification store:**
  ```ts
  // lib/notify/store.ts
  export function insertNotification(input: { readonly brandId: string; readonly recipient: string; readonly kind: NotificationKind; readonly dedupeKey: string; readonly payload: NotificationPayload }): Promise<{ readonly created: boolean; readonly notification: NotificationRecord }>;
  export function markNotificationSent(input: { readonly id: string; readonly delivery: NotificationDelivery; readonly providerMessageId: string | null }): Promise<void>; // status 'sent', attempts + 1
  export function markNotificationFailed(input: { readonly id: string; readonly error: string }): Promise<void>;     // status 'failed', attempts + 1, last_error
  export function claimTemplateFallback(id: string): Promise<NotificationRecord | null>; // update set delivery='template', attempts=attempts+1 where id and status='sent' and delivery='service' returning *
  export function getNotification(id: string): Promise<NotificationRecord | null>;
  export function recordWaMessage(input: { readonly brandId: string; readonly wamid: string; readonly draftId: string; readonly revision: number; readonly kind: "card" | "full_text"; readonly notificationId: string | null; readonly recipient: string }): Promise<void>; // on conflict (wamid) do nothing
  export function findWaMessage(wamid: string): Promise<{ readonly brandId: string; readonly draftId: string; readonly revision: number; readonly kind: "card" | "full_text"; readonly notificationId: string | null } | null>;
  ```
- **Channel identities:**
  ```ts
  // lib/db/channel-identities.ts
  export type ChannelIdentityKind = "whatsapp" | "slack";
  export type LinkedIdentity = {
    readonly id: string; readonly userId: string; readonly brandId: string; readonly channel: ChannelIdentityKind;
    readonly externalId: string; readonly phone: string | null; readonly bsuid: string | null;
    readonly email: string; readonly name: string | null; readonly linkedAt: string;
  };
  export function findLinkedIdentity(channel: ChannelIdentityKind, externalId: string): Promise<LinkedIdentity | null>; // joins "user" for email and name
  export function linkIdentity(input: { readonly channel: ChannelIdentityKind; readonly externalId: string; readonly userId: string; readonly brandId: string; readonly phone?: string | null; readonly bsuid?: string | null }): Promise<void>;
  // insert ... on conflict ("channel", "external_id") do update set user_id, brand_id, phone, bsuid, linked_at = now()
  export function listIdentitiesForBrand(brandId: string): Promise<LinkedIdentity[]>;          // newest first
  export function unlinkIdentity(brandId: string, id: string): Promise<boolean>;               // delete where id and brand_id
  export function findWhatsAppRecipient(brandId: string, userId: string): Promise<string | null>; // newest whatsapp external_id for that user in that brand
  ```

- [ ] **Step 1: Write `lib/notify/store.test.ts`.** Mock `@/lib/db/client` the way `lib/review.test.ts` does.
  - `insertNotification` renders `on conflict ("dedupe_key") do nothing`.
  - When the insert returns no row, it reads the existing row and returns `created: false`.
  - `claimTemplateFallback` renders `"status" = 'sent'` and `"delivery" = 'service'` guards, and returns `null` when no row comes back.
  - `recordWaMessage` renders `on conflict ("wamid") do nothing`.
  - `markNotificationSent` sets `"attempts" = "attempts" + 1`.
- [ ] **Step 2: Write `lib/db/channel-identities.test.ts`.**
  - `linkIdentity` renders `on conflict ("channel", "external_id") do update`.
  - `unlinkIdentity` renders a `"brand_id" =` predicate and returns `false` when nothing was deleted.
  - `findLinkedIdentity` maps a joined row to `LinkedIdentity` with ISO `linkedAt`.
  - `findWhatsAppRecipient` filters on `"channel" = 'whatsapp'`, `brand_id` and `user_id`.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/notify lib/db/channel-identities`. Expected: FAIL.
- [ ] **Step 4: Add the two tables to `lib/db/schema.ts`** and export `Notification` and `WaMessageMap` inferred types. Add `"notification"` and `"wa_message_map"` to `REQUIRED_TABLES`, keeping it sorted.
- [ ] **Step 5: Generate the migration.** Run `pnpm db:generate --name whatsapp`.
  - Expected: `lib/db/migrations/0011_whatsapp.sql` has exactly two `CREATE TABLE` statements, and otherwise only `CREATE INDEX` and `ADD CONSTRAINT`, with no `ALTER` or `DROP` of existing tables.
  - `drizzle-kit generate` reads the schema only; it doesn't connect.
- [ ] **Step 6: Implement `lib/notify/types.ts`, `lib/notify/store.ts` and `lib/db/channel-identities.ts`.**
- [ ] **Step 7: Run the checks.** Run `pnpm test` and `pnpm typecheck`. Expected: all pass, including `lib/db/client.test.ts`.
- [ ] **Step 8: Commit.**
```bash
git add lib/db lib/notify
git commit -m "feat(whatsapp): notification outbox, wa message map and linked identity store"
```

---

### Task 3: Channel identity and link codes

**Files:**
- Create: `lib/channel-auth.ts`, `lib/link-codes.ts`
- Test: `lib/channel-auth.test.ts`, `lib/link-codes.test.ts`

**Interfaces:**
- Consumes:
  - Task 2's `findLinkedIdentity` and `linkIdentity`;
  - Task 1's `getAllowedWhatsAppNumbers` and `normalizeWaNumber`;
  - `isEmailAllowed` and `getOwnerEmail` from `lib/allowlist.ts`;
  - `findUserIdByEmail`, `ensureOwnerBrand` and `isBrandMember` from `lib/db/brands.ts`;
  - `enforceRateLimit` and `RateLimitError`.
- Produces:
  ```ts
  // lib/channel-auth.ts
  import type { SessionAuthContext } from "eve/channels"; // the type the research found in eve's channel types; use the exported path that typechecks
  export function resolveChannelAuth(input: {
    readonly channel: ChannelIdentityKind;
    readonly externalId: string;                                  // WhatsApp: message.author.userId; Slack: "<teamId>:<userId>"
    readonly phone?: string | null;                               // WhatsApp wa_id digits when known
    readonly bsuid?: string | null;
    readonly extraAttributes?: Readonly<Record<string, string>>;  // merged first, so harpy's keys win
  }): Promise<SessionAuthContext | null>;

  // lib/link-codes.ts
  export const LINK_CODE_TTL_SECONDS = 600;
  export const LINK_ATTEMPTS_PER_HOUR = 5;
  export const LINK_ATTEMPTS_ALL_PER_HOUR = 30;
  export const LINK_CODES_PER_HOUR = 10;
  export class LinkCodeUnavailableError extends Error {}
  export function parseLinkCommand(text: string): string | null; // /^\s*link\s+(\d{6})\s*$/i, so "LINK 123456" gives "123456"
  export function createLinkCode(input: { readonly userId: string; readonly brandId: string; readonly channel: ChannelIdentityKind }): Promise<{ readonly code: string; readonly expiresAt: string }>;
  export type RedeemResult = { readonly ok: true; readonly email: string } | { readonly ok: false; readonly reason: "invalid" | "limited" | "unavailable" };
  export function redeemLinkCode(input: { readonly channel: ChannelIdentityKind; readonly externalId: string; readonly code: string; readonly phone?: string | null; readonly bsuid?: string | null }): Promise<RedeemResult>;
  ```
- **`resolveChannelAuth` rules:**
  1. Look up `findLinkedIdentity(channel, externalId)`.
  2. If there is none, and the channel is `whatsapp`, and `normalizeWaNumber(phone ?? externalId)` is in `getAllowedWhatsAppNumbers()`, bootstrap:
     - find the owner with `findUserIdByEmail(getOwnerEmail())`;
     - if the owner exists, `ensureOwnerBrand(ownerId)`, then `linkIdentity` with the phone and bsuid, then look up again;
     - if the owner has never signed in, return `null`.
  3. Return `null` when the identity's email fails `isEmailAllowed`, or when `isBrandMember(identity.brandId, identity.userId)` is false.
  4. Otherwise return:
     ```ts
     { authenticator: `harpy-${channel}`, issuer: channel, principalType: "user", principalId: identity.userId, subject: identity.email,
       attributes: { ...extraAttributes, brandId: identity.brandId, channel, email: identity.email, ...(identity.name ? { name: identity.name } : {}) } }
     ```
  5. For WhatsApp, the caller passes `extraAttributes: { waId: externalId }`.
- **`createLinkCode` rules:**
  - Throws `LinkCodeUnavailableError` without Redis, and `RateLimitError` past `LINK_CODES_PER_HOUR`.
  - The code is `randomInt(0, 1_000_000)` zero-padded to 6 digits, written with `set(key, json, { nx: true, ex: 600 })`. Retry up to 5 times on a collision.
  - Before writing, it deletes the user's previous code (`link:user:<channel>:<userId>`), then stores the new one there with the same TTL.
- **`redeemLinkCode` rules:**
  - Without Redis, the result is `unavailable`. When either attempt limit throws, the result is `limited`.
  - `getdel` the code. A missing code gives `invalid`.
  - If the code's user is no longer allowed or no longer a brand member, the result is `invalid`.
  - Otherwise `linkIdentity`, delete `link:user:<channel>:<userId>`, and return `ok` with the email.

- [ ] **Step 1: Write `lib/channel-auth.test.ts`.** Mock `@/lib/db/channel-identities` and `@/lib/db/brands`, and pass env through `vi.stubEnv`.
  - A linked, allowed WhatsApp identity returns exactly the principal above, with `attributes.waId` equal to the external id and `authenticator: "harpy-whatsapp"`.
  - A linked identity whose email was removed from `HARPY_OWNER_EMAIL` and `HARPY_ALLOWED_EMAILS` returns `null`.
  - An unlinked number in `HARPY_WHATSAPP_ALLOWED_NUMBERS`, with the owner signed up, calls `linkIdentity` with `channel: "whatsapp"` and returns the owner's principal.
  - The same, with `findUserIdByEmail` returning `null`, returns `null` and never calls `linkIdentity`.
  - An unlinked number not on the list returns `null` and never calls `findUserIdByEmail`.
  - An unlinked Slack id returns `null`, because the allowed numbers never apply to Slack.
  - Every attribute value in the returned principal is a string.
- [ ] **Step 2: Write `lib/link-codes.test.ts`.** Use a fake Redis with `get`, `set` (honoring `nx`), `getdel`, `del`, `incr` and `expire`, and mock `enforceRateLimit` and the identity store.
  - `parseLinkCommand` accepts `"link 123456"` and `" LINK 123456 "`. It rejects `"LINK 12345"`, `"please link 123456"` and `"LINK 1234567"`.
  - `createLinkCode` writes `link:code:whatsapp:<code>` with `ex: 600`, `nx: true`, and deletes the previous code from `link:user:whatsapp:<userId>`.
  - `redeemLinkCode` with the right code calls `linkIdentity` with the code's user and brand, and returns `{ ok: true, email }`. A second redeem of the same code is `invalid`.
  - A wrong code is `invalid`. When `enforceRateLimit` throws `RateLimitError`, the result is `limited` and the code is not read.
  - Without Redis, `createLinkCode` throws `LinkCodeUnavailableError`, and `redeemLinkCode` is `unavailable`.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/channel-auth lib/link-codes`. Expected: FAIL.
- [ ] **Step 4: Implement both modules.**
- [ ] **Step 5: Run them again.** Run `pnpm vitest run lib/channel-auth lib/link-codes`, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.**
```bash
git add lib/channel-auth.ts lib/channel-auth.test.ts lib/link-codes.ts lib/link-codes.test.ts
git commit -m "feat(identity): one principal for linked channels, owner bootstrap and link codes"
```

---

### Task 4: Cloud API client, review cards and templates

**Files:**
- Create: `lib/whatsapp/cloud-api.ts`, `lib/whatsapp/cards.ts`, `lib/whatsapp/templates.ts`
- Modify: `lib/studio/view-model.ts` (`draftMeta` takes the fields it reads, not a whole `StudioDraft`)
- Test: `lib/whatsapp/cloud-api.test.ts`, `lib/whatsapp/cards.test.ts`, `lib/whatsapp/templates.test.ts`

**Interfaces:**
- Consumes: `getWhatsAppConfig` and `WHATSAPP_GRAPH_VERSION` (Task 1), `DraftRecord`, `PLATFORMS`, `formatLocalTime`, `draftMeta`.
- Produces:
  ```ts
  // lib/whatsapp/cloud-api.ts
  export const WINDOW_CLOSED_CODE = 131047;
  export type WhatsAppOutbound = Readonly<Record<string, unknown>>; // a Cloud API message body without messaging_product
  export type WhatsAppSendResult =
    | { readonly ok: true; readonly wamid: string }
    | { readonly ok: false; readonly code: number | null; readonly windowClosed: boolean; readonly message: string };
  export function recipientFields(waId: string): { readonly to: string } | { readonly recipient: string }; // BSUID /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/ -> recipient
  export function textMessage(waId: string, body: string): WhatsAppOutbound; // { ...recipientFields, type: "text", text: { preview_url: false, body } }
  export function sendWhatsApp(message: WhatsAppOutbound, options?: { readonly config?: WhatsAppConfig | null; readonly fetch?: typeof fetch }): Promise<WhatsAppSendResult>;

  // lib/whatsapp/cards.ts
  export type HarpyAction =
    | { readonly verb: "approve" | "skip" | "edit"; readonly draftId: string; readonly revision: number }
    | { readonly verb: "review"; readonly ideaId: string };
  export function harpyActionId(action: HarpyAction): string;          // "harpy:approve:<draftId>:<revision>" | "harpy:review:<ideaId>"
  export function parseHarpyActionId(raw: string): HarpyAction | null;
  export const CARD_BODY_MAX = 1024;
  export const CARD_FOOTER_MAX = 60;
  export type CardDraft = Pick<DraftRecord, "id" | "revision" | "platform" | "posts" | "text" | "scheduledAt">;
  export type CardMessage = { readonly kind: "card" | "full_text"; readonly message: WhatsAppOutbound };
  export function reviewCardMessages(input: { readonly waId: string; readonly draft: CardDraft; readonly imageUrl: string | null; readonly timezone: string }): CardMessage[];

  // lib/whatsapp/templates.ts
  export const TEMPLATE_LANGUAGE = "en";
  export type TemplateName = "harpy_morning_brief" | "harpy_drafts_ready" | "harpy_post_published" | "harpy_post_failed" | "harpy_new_activity" | "harpy_weekly_report" | "harpy_reconnect_needed";
  export type TemplateSpec = { readonly name: TemplateName; readonly category: "UTILITY"; readonly body: string; readonly example: readonly string[]; readonly buttons: readonly string[] };
  export const TEMPLATES: Readonly<Record<TemplateName, TemplateSpec>>;
  export function templateParam(text: string, max: number): string; // whitespace runs (including newlines and tabs) become one space, trimmed, cut to max with a trailing "…"
  export function templateMessage(input: { readonly waId: string; readonly name: TemplateName; readonly params: readonly string[]; readonly payloads: readonly string[] }): WhatsAppOutbound;
  ```
- **`sendWhatsApp`:**
  - POST `https://graph.facebook.com/${WHATSAPP_GRAPH_VERSION}/${phoneNumberId}/messages` with `Authorization: Bearer <accessToken>`, `Content-Type: application/json`, and the body `{ messaging_product: "whatsapp", recipient_type: "individual", ...message }`.
  - On success, return `messages[0].id`.
  - On a non-2xx response, read `error.code` and `error.message`; `windowClosed` is `code === 131047`.
  - On a thrown fetch, return `code: null`.
  - Without config, return `{ ok: false, code: null, windowClosed: false, message: "WhatsApp is not set up." }` and make no request.
- **Card rules:**
  - **Body.** One post gives its text. Two or more posts give `"1/3 first\n\n2/3 second..."`.
  - **Over 1,024 characters.** The first message is a plain `textMessage` with the full body (`kind: "full_text"`). The card body is then the first 900 characters, cut back to the last whitespace, plus `"…\n\n(Full text above.)"`.
  - **Footer.** `draftMeta(draft, timezone)`, cut to 60 characters.
  - **Header.** `{ type: "image", image: { link: imageUrl } }` when `imageUrl` is set; no header otherwise.
  - **Buttons.** In this order: `Approve` (`harpy:approve:...`), `Edit` (`harpy:edit:...`), `Skip` (`harpy:skip:...`).
  - **Message shape.** `{ ...recipientFields(waId), type: "interactive", interactive: { type: "button", header?, body: { text }, footer: { text }, action: { buttons: [{ type: "reply", reply: { id, title } }] } } }`.
- **`parseHarpyActionId`** returns `null`:
  - for anything not starting with `harpy:`;
  - for an unknown verb;
  - for a revision that is not a positive integer;
  - for empty ids;
  - for input longer than 256 characters.
- **`draftMeta`** becomes `draftMeta(draft: Pick<DraftRecord, "platform" | "posts" | "text" | "scheduledAt">, timezone: string)`. Its output is unchanged. Studio callers keep compiling.
- **Template wording.** This is the copy the owner submits to Meta, so pin it exactly:

  | Name | Body | Example params | Quick replies |
  |---|---|---|---|
  | `harpy_morning_brief` | `Your content brief for {{1}} is ready: {{2}} trends and {{3}} post ideas.` | `Thu 22 Oct`, `3`, `5` | `Show brief`, `Not today` |
  | `harpy_drafts_ready` | `You have {{1}} new drafts to review: {{2}}` | `3`, `Small teams ship faster` | `Review` |
  | `harpy_post_published` | `Your {{1}} post is live.` | `LinkedIn` | `View post` |
  | `harpy_post_failed` | `Your {{1}} post could not be published: {{2}}` | `X`, `the image was too large` | `Retry`, `Open` |
  | `harpy_new_activity` | `{{1}} new replies and mentions. {{2}} may need a response.` | `4`, `2` | `Review now`, `Later` |
  | `harpy_weekly_report` | `Your weekly summary for {{1}} is ready.` | `19 to 25 Oct` | `Show summary` |
  | `harpy_reconnect_needed` | `Your {{1}} connection needs you to sign in again by {{2}}.` | `LinkedIn`, `Mon 14 Dec` | `Open Channels` |

- **`templateMessage`** builds:
  ```ts
  { ...recipientFields(waId), type: "template", template: { name, language: { code: "en" }, components: [
      { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
      ...payloads.map((payload, index) => ({ type: "button", sub_type: "quick_reply", index: String(index), parameters: [{ type: "payload", payload }] })) ] } }
  ```

- [ ] **Step 1: Write `lib/whatsapp/cloud-api.test.ts`.** Use an injected `fetch` mock and a fixed config.
  - The URL is `https://graph.facebook.com/v25.0/PNID/messages` and the header is `Bearer TOKEN`.
  - The body has `messaging_product: "whatsapp"` and `recipient_type: "individual"`.
  - A `200 { messages: [{ id: "wamid.1" }] }` response returns `{ ok: true, wamid: "wamid.1" }`.
  - A `400 { error: { code: 131047, message: "Re-engagement message" } }` response returns `windowClosed: true, code: 131047`.
  - A rejected fetch returns `{ ok: false, code: null, windowClosed: false }`.
  - With `config: null`, the result is not ok and `fetch` is never called.
  - `recipientFields("15551234567")` is `{ to: "15551234567" }`, and `recipientFields("US.13491208655302741918")` is `{ recipient: "US.13491208655302741918" }`.
- [ ] **Step 2: Write `lib/whatsapp/cards.test.ts`.**
  - `parseHarpyActionId(harpyActionId(a))` round-trips each verb.
  - `parseHarpyActionId` is `null` for each of: `"harpy:approve:d1"`, `"harpy:approve:d1:0"`, `"harpy:approve:d1:abc"`, `"harpy:publish:d1:1"`, `"chat:{}"`, and a 300-character id.
  - A 20-character LinkedIn draft with an image gives one `card`:
    - header `{ type: "image", image: { link: "https://blob/x.png" } }`;
    - body equal to the text;
    - footer `"LinkedIn · 20 chars"`;
    - button ids `harpy:approve:d1:2`, `harpy:edit:d1:2` and `harpy:skip:d1:2`, with titles `Approve`, `Edit` and `Skip`.
  - An X thread of `["first", "second"]` has the body `"1/2 first\n\n2/2 second"`.
  - A 1,500-character post gives `[full_text, card]`. The card body is at most 1,024 characters and ends with `"(Full text above.)"`.
  - An X post with a link has a footer containing `"includes a link"` and at most 60 characters.
  - With no image there is no `header` key.
- [ ] **Step 3: Write `lib/whatsapp/templates.test.ts`.**
  - For every entry in `TEMPLATES`, the number of distinct `{{n}}` placeholders equals `example.length`, and every button label is at most 20 characters.
  - `templateParam("a\n\nb\tc     d", 100)` is `"a b c d"`, and `templateParam("x".repeat(70), 60)` has 60 characters and ends with `"…"`.
  - `templateMessage({ waId: "1555", name: "harpy_drafts_ready", params: ["3", "Idea"], payloads: ["harpy:review:i1"] })` equals the shape above, with the button `index: "0"`.
- [ ] **Step 4: Run them.** Run `pnpm vitest run lib/whatsapp lib/studio`. Expected: FAIL for the new files; the existing studio tests still pass.
- [ ] **Step 5: Implement the three modules, and widen `draftMeta`'s parameter type.**
- [ ] **Step 6: Run the checks.** Run `pnpm vitest run lib/whatsapp lib/studio`, then `pnpm typecheck`. Expected: PASS.
- [ ] **Step 7: Commit.**
```bash
git add lib/whatsapp lib/studio/view-model.ts
git commit -m "feat(whatsapp): cloud api sender, review cards with image headers, and the template set"
```

---

### Task 5: The 24-hour window and review delivery

**Files:**
- Create: `lib/whatsapp/window.ts`, `lib/whatsapp/deliver.ts`
- Test: `lib/whatsapp/window.test.ts`, `lib/whatsapp/deliver.test.ts`

**Interfaces:**
- Consumes:
  - Tasks 2 and 4;
  - `getRedis`;
  - `getDraft` and `listDraftsForIdea` (`lib/drafts/store.ts`);
  - `getIdea`;
  - `getMediaAsset` (`lib/media/assets.ts`);
  - `getBrandSettings`;
  - `isValidTimeZone`.
- Produces:
  ```ts
  // lib/whatsapp/window.ts
  export const WINDOW_SECONDS = 86_400;
  export const WINDOW_SAFETY_SECONDS = 600;
  export function touchWindow(waId: string, now?: Date): Promise<void>;     // set wa:window:<waId> = now ISO, ex 86_400; no-op without Redis
  export function isWindowOpen(waId: string, now?: Date): Promise<boolean>; // false without Redis, without the key, or when older than 86_400 - 600 seconds

  // lib/whatsapp/deliver.ts
  export type CardSendOutcome = { readonly sent: number; readonly windowClosed: boolean; readonly error: string | null };
  export function sendReviewCards(input: { readonly brandId: string; readonly waId: string; readonly drafts: readonly DraftRecord[]; readonly notificationId: string | null }): Promise<CardSendOutcome>;
  export type NotifyResult =
    | { readonly ok: true; readonly delivery: "cards" | "template" | "duplicate"; readonly sent: number }
    | { readonly ok: false; readonly reason: "not_configured" | "nothing_to_review" | "send_failed"; readonly message: string };
  export function notifyDraftsReady(input: { readonly brandId: string; readonly waId: string; readonly ideaId: string; readonly draftIds?: readonly string[]; readonly resendKey?: string }): Promise<NotifyResult>;
  export function sendDraftsReadyTemplate(notification: NotificationRecord): Promise<WhatsAppSendResult>; // also used by Task 8
  ```
- **`sendReviewCards`:**
  - It takes the brand's time zone (falling back to UTC when invalid) and each draft's first image: `getMediaAsset(mediaIds[0])`, used only when its `brandId` matches.
  - It sends each draft's `reviewCardMessages` in order and calls `recordWaMessage` for every message that went out.
  - It stops at the first failure: `windowClosed: true` if the failure is 131047, else `error` set.
- **`notifyDraftsReady`:**
  1. `not_configured` when `getWhatsAppConfig()` is null.
  2. Take the idea's drafts with status `pending_review`, keeping only those in `draftIds` when given. None gives `nothing_to_review`.
  3. `dedupeKey = "drafts_ready:" + sha256(waId + "|" + ideaId + "|" + sorted "<id>@<revision>" list joined by "," + (resendKey ? "|" + resendKey : ""))`, hex.
  4. `insertNotification` with the payload `{ kind: "drafts_ready", ideaId, drafts: [{ id, revision }] }`. If `created` is false, the result is `{ ok: true, delivery: "duplicate", sent: 0 }`.
  5. If `isWindowOpen(waId)`, `sendReviewCards`:
     - with no failure, `markNotificationSent(service, last wamid)` and return `cards`;
     - on `windowClosed`, fall through to step 6;
     - on another error, `markNotificationFailed` and return `send_failed`.
  6. Otherwise `sendDraftsReadyTemplate`:
     - the template is `harpy_drafts_ready`, with params `[String(drafts.length), templateParam(idea.text, 60)]` and payloads `[harpyActionId({ verb: "review", ideaId })]`;
     - on success, `markNotificationSent(template, wamid)` and return `template`;
     - on failure, `markNotificationFailed` and return `send_failed`.
  7. The `send_failed` message is `"Couldn't reach WhatsApp. Try again in a minute."`.

- [ ] **Step 1: Write `lib/whatsapp/window.test.ts`.** Use a fake Redis and a fixed `now`.
  - `touchWindow("1555", now)` calls `set("wa:window:1555", now.toISOString(), { ex: 86400 })`.
  - `isWindowOpen` is `true` one hour later, `false` 23 h 55 min later, and `false` with no key or no Redis.
- [ ] **Step 2: Write `lib/whatsapp/deliver.test.ts`.** Mock the stores, `sendWhatsApp`, `isWindowOpen`, `getMediaAsset` and the config. Use two pending drafts and one approved draft.
  - Not configured gives `not_configured`, with no insert.
  - All drafts approved gives `nothing_to_review`.
  - Window open: two cards are sent, `recordWaMessage` is called twice with `kind: "card"` and the notification id, `markNotificationSent` is called with `delivery: "service"`, and the result is `{ delivery: "cards", sent: 2 }`.
  - `insertNotification` returning `created: false` gives `duplicate`, and `sendWhatsApp` is never called.
  - Window closed: one template is sent, with payload `harpy:review:i1` and first param `"2"`, and the result is `template`.
  - Window open but the first card returns 131047: the template is sent and the result is `template`.
  - The template send fails: `markNotificationFailed` is called and the result is `send_failed`.
  - The same drafts with a different `resendKey` produce a different `dedupeKey`.
  - A `mediaIds[0]` belonging to another brand sends a card with no header.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/whatsapp/window lib/whatsapp/deliver`. Expected: FAIL.
- [ ] **Step 4: Implement both modules.**
- [ ] **Step 5: Run them again.** Then run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.**
```bash
git add lib/whatsapp
git commit -m "feat(whatsapp): track the 24-hour window and deliver review cards or the drafts template"
```

---

### Task 6: Button taps and the edit marker

**Files:**
- Create: `lib/whatsapp/copy.ts`, `lib/whatsapp/review.ts`
- Test: `lib/whatsapp/review.test.ts`

**Interfaces:**
- Consumes:
  - `approveDraft`, `skipDraft` and `reviewFailureMessage` (`lib/review.ts`);
  - `getDraft` and `listDraftsForIdea`;
  - `canApply`;
  - Task 3's `resolveChannelAuth`;
  - Tasks 4 and 5.
- Produces:
  ```ts
  // lib/whatsapp/copy.ts (every WhatsApp reply harpy writes itself)
  export const COPY = {
    linked: (email: string) => `Linked. harpy knows this number as ${email}.`,
    linkFailed: "That code didn't work. Make a new one on the Channels page.",
    rateLimited: "You're sending messages faster than I can keep up. Give me a few minutes.",
    reset: "Started a new conversation. Your drafts, calendar and voice are kept.",
    voiceFailed: "I couldn't make out that voice note. Could you type it?",
    approved: (label: string) => `Approved the ${label} draft. It waits in Studio under Up next.`,
    skipped: (label: string) => `Skipped the ${label} draft. You can restore it in Studio.`,
    editPrompt: (label: string) => `What should I change in the ${label} draft? Reply with text or a voice note.`,
    nothingToReview: "Nothing from that idea is waiting for review.",
  } as const;

  // lib/whatsapp/review.ts
  export const EDIT_MARKER_TTL_SECONDS = 1_800;
  export type PendingEdit = { readonly draftId: string; readonly revision: number; readonly platform: SocialPlatform };
  export function setPendingEdit(waId: string, edit: PendingEdit): Promise<void>;
  export function takePendingEdit(waId: string): Promise<PendingEdit | null>; // getdel; malformed JSON gives null
  export function claimTap(tapId: string): Promise<boolean>;                  // set wa:tap:<id> "1" { nx: true, ex: 86_400 }; true when Redis is missing
  export function handleHarpyAction(input: { readonly action: HarpyAction; readonly tapId: string; readonly waId: string; readonly brandId: string }): Promise<void>;
  export function handleIncomingAction(input: { readonly actionId: string; readonly tapId: string; readonly waId: string; readonly phone: string | null }): Promise<void>;
  ```
- **`handleIncomingAction`** is what the channel calls for every tap:
  - `parseHarpyActionId` null: return;
  - `resolveChannelAuth({ channel: "whatsapp", externalId: waId, phone, extraAttributes: { waId } })` null: return;
  - otherwise call `handleHarpyAction` with the principal's `brandId`.
- **`handleHarpyAction`:**
  1. `claimTap(tapId)` false: return.
  2. `touchWindow(waId)`.
  3. **approve:** `approveDraft({ brandId, draftId, expectedRevision: revision, via: "whatsapp", expectedStatus: "pending_review" })`.
  4. **skip:** `skipDraft({ brandId, draftId, expectedRevision: revision, expectedStatus: "pending_review" })`.
  5. **On ok,** send `COPY.approved(label)` or `COPY.skipped(label)`, with the label from `PLATFORMS[draft.platform].label`.
  6. **On failure,** send `reviewFailureMessage(reason)`. When the current draft is `pending_review`, also `sendReviewCards` for it with a null notification id.
  7. **edit:** `getDraft`. If it exists at `revision` and `canApply("edit", status)`, `setPendingEdit` and send `COPY.editPrompt(label)`. Otherwise follow the failure path, using the stale message for a revision mismatch and `not_found` when missing.
  8. **review:** take the idea's `pending_review` drafts. If there are any, `sendReviewCards`; otherwise send `COPY.nothingToReview`.
  9. Replies use `sendWhatsApp(textMessage(waId, ...))`.

- [ ] **Step 1: Write `lib/whatsapp/review.test.ts`.** Mock `lib/review`, the draft store, `sendWhatsApp`, `sendReviewCards`, `touchWindow`, `resolveChannelAuth` and Redis.
  - `claimTap` false: no review call, no send, no `touchWindow`.
  - Approve ok: `approveDraft` is called with `{ expectedRevision: 2, via: "whatsapp", expectedStatus: "pending_review" }`, and the text sent is `COPY.approved("LinkedIn")`.
  - Approve stale, with the current draft pending at revision 3: the text is `"That draft changed. Showing the latest."` and `sendReviewCards` gets that draft.
  - Skip on a skipped draft (`invalid_state`): the text is `"That draft can't do that right now."` and no card goes out.
  - Edit on the current revision: `setPendingEdit` is called with `{ draftId, revision, platform }` and the prompt is sent. Edit on an old revision sets no marker and sends the stale message plus the card.
  - Review with two pending drafts calls `sendReviewCards` with both. With none, it sends `COPY.nothingToReview`.
  - `handleIncomingAction` with a non-harpy id, or with `resolveChannelAuth` returning null, never calls `claimTap`.
  - `takePendingEdit` returns the stored edit once, and then `null`.
- [ ] **Step 2: Run it.** Run `pnpm vitest run lib/whatsapp/review`. Expected: FAIL.
- [ ] **Step 3: Implement `lib/whatsapp/copy.ts` and `lib/whatsapp/review.ts`.**
- [ ] **Step 4: Run it again.** Then run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit.**
```bash
git add lib/whatsapp
git commit -m "feat(whatsapp): approve, skip, edit and review taps with stale handling and tap dedupe"
```

---

### Task 7: Inbound messages and reply formatting

**Files:**
- Create: `lib/whatsapp/transcribe.ts`, `lib/whatsapp/inbound.ts`, `lib/whatsapp/reply.ts`
- Test: `lib/whatsapp/inbound.test.ts`, `lib/whatsapp/reply.test.ts`

**Interfaces:**
- Consumes:
  - Tasks 3 to 6;
  - `requestRevision` (`lib/review.ts`);
  - `findWaMessage` (Task 2);
  - `isPublicBlobUrl` (`lib/media/source-url.ts`);
  - `getAppOrigin`.
- Produces:
  ```ts
  // lib/whatsapp/transcribe.ts
  export const TRANSCRIPTION_MODEL = "openai/whisper-1";
  export function transcribeVoiceNote(audio: Uint8Array, abortSignal?: AbortSignal): Promise<string>; // transcribe() from "ai"; trimmed; throws on empty

  // lib/whatsapp/inbound.ts
  export const WHATSAPP_INBOUND_PER_10_MIN = 30;
  export type InboundAttachment = { readonly type: "image" | "file" | "video" | "audio"; readonly mimeType?: string; readonly name?: string; readonly fetchData?: () => Promise<Buffer | ArrayBuffer> };
  export type InboundMessage = { readonly id: string; readonly waId: string; readonly phone: string | null; readonly bsuid: string | null; readonly text: string; readonly attachments: readonly InboundAttachment[]; readonly quotedWamid: string | null };
  export function toInboundMessage(message: { readonly id: string; readonly text: string; readonly author: { readonly userId: string }; readonly attachments?: readonly InboundAttachment[]; readonly raw?: unknown }): InboundMessage;
  // phone = raw.contact?.wa_id ?? (author.userId when it is all digits); bsuid = raw.userId when it matches the BSUID pattern; quotedWamid = raw.message?.context?.id
  export type InboundPlan =
    | { readonly kind: "ignore" }
    | { readonly kind: "reply"; readonly text: string; readonly cardDraftId?: string; readonly brandId?: string }
    | { readonly kind: "reset"; readonly auth: SessionAuthContext }
    | { readonly kind: "turn"; readonly auth: SessionAuthContext; readonly text: string; readonly attachments: readonly InboundAttachment[]; readonly context: readonly string[] };
  export type InboundDeps = { /* every collaborator below, defaulted to the real modules; tests pass fakes */ };
  export function planInbound(message: InboundMessage, deps?: Partial<InboundDeps>): Promise<InboundPlan>;
  export function runInbound(message: InboundMessage, effects: {
    readonly startTurn: (plan: Extract<InboundPlan, { kind: "turn" }>) => Promise<void>;
    readonly resetSession: () => Promise<boolean>; // true when a reset ran
  }, deps?: Partial<InboundDeps>): Promise<void>;

  // lib/whatsapp/reply.ts
  export function formatWhatsAppReply(markdown: string, isAllowedImageUrl?: (url: string) => boolean): { readonly text: string; readonly imageUrls: readonly string[] };
  ```
- **`planInbound` order.** This order is what the Review Focus tests pin.
  1. **Link command.** `parseLinkCommand(text)` gives a code:
     - `redeemLinkCode({ channel: "whatsapp", externalId: waId, code, phone, bsuid })` ok: reply `COPY.linked(email)`;
     - not ok, sender already linked (`resolveChannelAuth` non-null): reply `COPY.linkFailed`;
     - otherwise `ignore`.
  2. **Unknown sender.** `auth = resolveChannelAuth({ channel: "whatsapp", externalId: waId, phone, bsuid, extraAttributes: { waId } })`. If null, `ignore`.
  3. **Rate limit.** `incr` `wa:inbound:<waId>:<floor(now/600s)>`, with `expire` 600 on the first count.
     - The count equal to `WHATSAPP_INBOUND_PER_10_MIN + 1` replies `COPY.rateLimited`.
     - A higher count is `ignore`.
     - Without Redis, there is no limit.
  4. **Window.** `touchWindow(waId)`.
  5. **Reset.** `text.trim().toLowerCase() === "/new"` gives `reset`.
  6. **Attachments.**
     - Drop attachments with `mimeType === "application/geo+json"` (locations) or `name === "sticker"`.
     - If nothing is left and the text is `"[Sticker]"`, the plan is `ignore`.
  7. **Voice.** For the first `audio` attachment: `transcribeVoiceNote(new Uint8Array(await fetchData()))`.
     - The text becomes the transcript when it was `"[Audio message]"` or `"[Voice message]"`; otherwise the transcript is appended on a new line.
     - Remove the audio attachment.
     - Add the context `"The owner sent this as a voice note. The text is its transcript."`.
     - Any error replies `COPY.voiceFailed`.
  8. **Edit target.** `takePendingEdit(waId)`. When it is null and `quotedWamid` is set, `findWaMessage(quotedWamid)` restricted to the sender's brand gives the target.
     - With a target, `requestRevision({ brandId, draftId, expectedRevision })`.
     - When ok, add the context: `This message is the change the owner wants to the ${label} draft ${draftId}. Call revise_draft with draftId "${draftId}" and the owner's words as the instruction, then call submit_for_review with draftIds ["${draftId}"]. Draft nothing else.`
     - When not ok, reply `reviewFailureMessage(reason)`, with `cardDraftId` set when the current draft is `pending_review`.
  9. **Turn.** Otherwise `turn` with `auth`, `text`, the remaining attachments and `context`.
- **`runInbound` effects:**
  - `reply` sends `textMessage`, then, when `cardDraftId` is set, `sendReviewCards` for that draft.
  - `reset` calls `resetSession()`. When it returns true, send `COPY.reset`; otherwise send nothing and log a warning.
  - `turn` calls `startTurn`.
  - `ignore` does nothing.
- **`formatWhatsAppReply`:**
  - It takes every `![alt](url)` out of the text. Allowed URLs go to `imageUrls`; disallowed ones are dropped. By default, an allowed URL is a public Blob URL or the app's origin.
  - It rewrites `[label](url)` as `label: url`, or as just `url` when the label equals the URL.
  - It collapses three or more newlines to two, and trims.

- [ ] **Step 1: Write `lib/whatsapp/inbound.test.ts`.** Every collaborator is a fake passed through `deps`.
  - Unknown sender, plain text: `ignore`. `transcribe`, `touchWindow` and `takePendingEdit` are never called.
  - Unknown sender with a voice note: `ignore`, and `transcribe` is never called.
  - Unknown sender, `"LINK 123456"` with a valid code: a reply with `COPY.linked("owner@example.com")`. With an invalid code: `ignore`.
  - Linked sender, invalid code: a reply with `COPY.linkFailed`.
  - Message 31 in the window replies `COPY.rateLimited`; message 32 is `ignore`.
  - `"/new"`: `reset`, and `takePendingEdit` is not called. `"LINK 123456"` from a linked sender doesn't call `takePendingEdit` either.
  - A voice note `{ text: "[Audio message]", attachments: [{ type: "audio", fetchData }] }` becomes a turn with text `"hello there"`, no attachments, and the voice context line. When `transcribe` throws, the reply is `COPY.voiceFailed`.
  - A location attachment is dropped from the turn. A sticker-only message is `ignore`.
  - Pending edit `{ draftId: "d1", revision: 2, platform: "x" }` with `requestRevision` ok gives a turn whose context contains `revise_draft with draftId "d1"` and `submit_for_review with draftIds ["d1"]`.
  - The same with `requestRevision` stale, current draft pending: a reply with `"That draft changed. Showing the latest."` and `cardDraftId: "d1"`.
  - No marker, but `quotedWamid` maps to draft `d2` at revision 1: an edit context for `d2`.
  - A quoted wamid from another brand is ignored.
  - `runInbound` with a `reset` plan whose `resetSession` returns false sends nothing.
- [ ] **Step 2: Write `lib/whatsapp/reply.test.ts`.**
  - `"Here\n\n![a cat](https://x.public.blob.vercel-storage.com/media/1.png)\n\nDone"` gives the text `"Here\n\nDone"` and that one URL.
  - An image at `https://evil.example/x.png` is dropped from both the text and the URLs.
  - `"[docs](https://a.b)"` gives `"docs: https://a.b"`, and `"[https://a.b](https://a.b)"` gives `"https://a.b"`.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/whatsapp/inbound lib/whatsapp/reply`. Expected: FAIL.
- [ ] **Step 4: Implement the three modules.** Read `patterns/voice-notes.md` first. `transcribe` takes `{ model: TRANSCRIPTION_MODEL, audio, abortSignal }`.
- [ ] **Step 5: Run them again.** Then run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.**
```bash
git add lib/whatsapp
git commit -m "feat(whatsapp): inbound planning with linking, limits, voice notes and edit replies"
```

---

### Task 8: Delivery statuses and the route wrapper

**Files:**
- Create: `lib/whatsapp/statuses.ts`, `lib/whatsapp/route.ts`
- Test: `lib/whatsapp/statuses.test.ts`, `lib/whatsapp/route.test.ts`

**Interfaces:**
- Consumes: Task 2's `findWaMessage`, `claimTemplateFallback`, `getNotification` and `markNotificationFailed`; Task 5's `sendDraftsReadyTemplate`; `markNotificationSent`.
- Produces:
  ```ts
  // lib/whatsapp/statuses.ts
  export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean; // "sha256=" + hex HMAC-SHA256, timingSafeEqual; false on missing or wrong length
  export type WhatsAppStatus = { readonly wamid: string; readonly status: "sent" | "delivered" | "read" | "failed"; readonly recipient: string; readonly errorCode: number | null };
  export function extractStatuses(payload: unknown): WhatsAppStatus[]; // entry[].changes[] where field === "messages" -> value.statuses[]; tolerant of missing arrays
  export function handleStatuses(statuses: readonly WhatsAppStatus[]): Promise<void>;

  // lib/whatsapp/route.ts
  import { AsyncLocalStorage } from "node:async_hooks";
  export type SessionResetter = (address: string) => Promise<boolean>;
  export const webhookResetter: AsyncLocalStorage<SessionResetter>;
  export type RouteLike = { readonly transport?: string; readonly handler: (request: Request, args: RouteArgsLike) => Response | Promise<Response> } & Record<string, unknown>;
  export type RouteArgsLike = { readonly from: (address: string) => { reset(options?: { reason?: string }): Promise<{ status: string }> }; readonly waitUntil: (promise: Promise<unknown>) => void } & Record<string, unknown>;
  export function wrapWhatsAppRoutes<T extends RouteLike>(routes: readonly T[], options: { readonly appSecret: () => string | null; readonly onStatuses?: (statuses: WhatsAppStatus[]) => Promise<void> }): T[];
  ```
- **`handleStatuses`** looks only at `failed` statuses. For each one, `findWaMessage(wamid)`:
  - **A card or full text with a `notificationId`, failed with 131047:**
    - `claimTemplateFallback(notificationId)` gives a row: `sendDraftsReadyTemplate(row)`, then `markNotificationSent(template)` on success or `markNotificationFailed` on failure;
    - null: do nothing, because the template already went.
  - **A template wamid** (no `wa_message_map` row, but some `notification.provider_message_id` equals it): `markNotificationFailed` with `"WhatsApp error <code>"`. Add `findNotificationByProviderMessageId` to `lib/notify/store.ts` for this.
  - **Any other failure:** log a warning and write nothing.
- **`wrapWhatsAppRoutes`** maps each non-websocket route to a new handler:
  1. For `POST`: `raw = await request.clone().text()`. When `appSecret()` is set and `verifyMetaSignature(raw, request.headers.get("x-hub-signature-256"), secret)` passes, parse the JSON. If the statuses are non-empty, `args.waitUntil(onStatuses(statuses))`. Parse errors are swallowed.
  2. Run the original handler inside `webhookResetter.run(resetter, ...)`. The resetter is `async (address) => (await args.from(address).reset({ reason: "/new" })).status === "reset"`. The original handler gets the original, unread request.
  3. Websocket routes are returned unchanged.

- [ ] **Step 1: Write `lib/whatsapp/statuses.test.ts`.**
  - `verifyMetaSignature` is true for a correct `sha256=` HMAC of the body, and false for a tampered body, a missing header, and `"sha256=abc"`.
  - `extractStatuses` reads a sample Meta payload with one `failed` status (`errors: [{ code: 131047 }]`) and one `read` status.
  - `handleStatuses` with `failed 131047` for a card wamid whose notification `claimTemplateFallback` returns: the template is sent once and `markNotificationSent` is called with `delivery: "template"`.
  - Repeating the same status while `claimTemplateFallback` returns null sends no second template.
  - A `failed` status for a template wamid calls `markNotificationFailed`.
  - `read` and `delivered` statuses cause no store calls.
- [ ] **Step 2: Write `lib/whatsapp/route.test.ts`.** Use fake routes and args.
  - A signed POST with a statuses payload calls `onStatuses` through `waitUntil`, and the original handler still reads the full body with `await request.text()`.
  - An unsigned POST never calls `onStatuses`, and the original handler still runs.
  - A GET passes straight through.
  - Inside the original handler, `webhookResetter.getStore()` is a function that calls `args.from(address).reset({ reason: "/new" })`.
  - A websocket route is returned as the same object.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/whatsapp/statuses lib/whatsapp/route`. Expected: FAIL.
- [ ] **Step 4: Implement both modules,** and `findNotificationByProviderMessageId`.
- [ ] **Step 5: Run them again.** Then run `pnpm typecheck`. Expected: PASS.
- [ ] **Step 6: Commit.**
```bash
git add lib/whatsapp lib/notify
git commit -m "feat(whatsapp): read delivery statuses before the adapter and fall back to templates once"
```

---

### Task 9: The WhatsApp channel

**Files:**
- Create: `agent/channels/whatsapp.ts`
- Read first: `node_modules/eve/docs/channels/chat-sdk.mdx` and `channels/custom.mdx` (route wrapping), and `node_modules/eve/dist/src/public/channels/chat-sdk/chatSdkChannel.d.ts`

**Interfaces:**
- Consumes:
  - Task 1: `createHarpyWhatsAppAdapter` and `createChatState`;
  - Task 3: `resolveChannelAuth`;
  - Task 6: `handleIncomingAction`;
  - Task 7: `toInboundMessage`, `runInbound` and `formatWhatsAppReply`;
  - Task 8: `wrapWhatsAppRoutes`, `webhookResetter` and `handleStatuses`;
  - `getWhatsAppConfig`.
- Produces: the channel `whatsapp`, with webhook `GET|POST /eve/v1/whatsapp`.
- **Shape** (the only logic is wiring):
  ```ts
  import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";

  const adapter = createHarpyWhatsAppAdapter();
  const bridge = chatSdkChannel({
    userName: "harpy",
    adapters: { whatsapp: adapter },
    state: createChatState(),
    streaming: false,            // WhatsApp can't edit messages
    concurrency: "concurrent",   // the default "drop" loses messages sent during a turn
    turnPolicy: "steer",
    resolveInputAuth: (event) => resolveChannelAuth({ channel: "whatsapp", externalId: event.user.userId, extraAttributes: { waId: event.user.userId } }),
    events: {
      async "message.completed"(eventData, channel) {
        if (!eventData.message || !channel.thread) return;
        const { text, imageUrls } = formatWhatsAppReply(eventData.message);
        if (!text && imageUrls.length === 0) return;
        await channel.thread.post({ markdown: text, attachments: imageUrls.map((url) => ({ type: "image", url, mimeType: url.endsWith(".png") ? "image/png" : "image/jpeg" })) });
      },
    },
  });
  ```
- **`bot.onDirectMessage(async (thread, message) => ...)`** calls `runInbound(toInboundMessage(message), { startTurn, resetSession })`.
  - `startTurn(plan)` awaits `bridge.send(content, { thread, auth: plan.auth, idempotencyKey: message.id, context: plan.context })`.
  - `content` is `plan.text` when no attachments remain. Otherwise it is `messageToUserContent` of a copy of `message` carrying `plan.text` and `plan.attachments`. Build the copy with `Object.assign(Object.create(Object.getPrototypeOf(message)), message, { text: plan.text, attachments: plan.attachments })`, after checking in the eve source which fields `messageToUserContent` reads.
  - `resetSession()` returns `webhookResetter.getStore()?.(thread.id) ?? false`.
- **`bot.onAction(async (event) => ...)`** calls `handleIncomingAction({ actionId: event.actionId, tapId: event.messageId, waId: event.user.userId, phone: <digits of event.user.userId or null> })`. eve's own `eve_input:` handler keeps working, because `parseHarpyActionId` ignores those ids.
- **The default export** is `{ ...bridge.channel, routes: wrapWhatsAppRoutes(bridge.channel.routes, { appSecret: () => getWhatsAppConfig()?.appSecret ?? null, onStatuses: handleStatuses }) }`.
- **Nothing else here.** Copy, limits and decisions stay in `lib/whatsapp/*`.

- [ ] **Step 1: Write `agent/channels/whatsapp.ts`** to the shape above. Check every name against the `.d.ts` files listed under **Read first**. Where a type differs, for example the attachment `mimeType` field name, follow the `.d.ts` and note it in the report.
- [ ] **Step 2: Run `pnpm eve:build`.**
  - Expected: success, with the channel `whatsapp` listed and its routes at `/eve/v1/whatsapp`.
  - It must succeed with no `WHATSAPP_*` or `REDIS_URL` in the environment. Run it as `env -u REDIS_URL -u KV_URL pnpm eve:build` in Git Bash, or clear them in PowerShell first.
- [ ] **Step 3: Run `pnpm typecheck` and `pnpm build`.** Expected: no errors. If two copies of `chat` cause a type clash between the app's `Thread` and eve's, cast at the boundary with a one-line comment rather than changing versions.
- [ ] **Step 4: Commit.**
```bash
git add agent/channels/whatsapp.ts
git commit -m "feat(whatsapp): the whatsapp channel on the chat sdk adapter"
```

---

### Task 10: Drafting from the owner's photo

**Files:**
- Create: `lib/media/attachments.ts`, `agent/tools/save_photo.ts`
- Modify:
  - `lib/drafts/input.ts` (`imageMediaId`, `sourceKind`);
  - `lib/drafts/steps.ts` (`prepareDrafting` validates the photo and sets the idea source);
  - `lib/drafts/orchestrate.ts` (`ownerMediaId` in `DraftingPlan`, used instead of generating);
  - `agent/tools/generate_image.ts` (`sourceAttachmentPath`).
- Test: `lib/media/attachments.test.ts`, `lib/drafts/input.test.ts`, `lib/drafts/steps.test.ts`, `lib/drafts/orchestrate.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/media/attachments.ts
  export const ATTACHMENTS_DIR = "/workspace/.eve/attachments/";
  export function normalizeAttachmentPath(path: string): string | null; // posix.normalize; must start with ATTACHMENTS_DIR and not equal it
  export function sniffImageType(bytes: Uint8Array): "image/png" | "image/jpeg" | "image/webp" | "image/gif" | null; // magic bytes
  export type SandboxReader = { readonly getSandbox: () => Promise<{ readBinaryFile(args: { path: string; abortSignal?: AbortSignal }): Promise<Uint8Array | null | undefined> }>; readonly abortSignal?: AbortSignal };
  export function readAttachmentImage(ctx: SandboxReader, path: string): Promise<{ readonly ok: true; readonly bytes: Uint8Array; readonly mediaType: string } | { readonly ok: false; readonly message: string }>;
  ```
- **`save_photo` tool:**
  - Input: `{ path: string }`, described as "The photo's path from its Attached file label."
  - It resolves the brand with `resolveBrandContext`, then `readAttachmentImage`, then `saveMediaAsset({ brandId, userId, bytes, mediaType, source: channel === "whatsapp" ? "whatsapp" : "uploaded" })`.
  - It returns `{ ok: true, mediaId, url }`, or `{ ok: false, message }`.
  - Description: "Save a photo the owner sent so it can go on posts or be edited. Returns a mediaId for draft_posts (imageMediaId) and a url."
- **`draft_posts` input:**
  - `imageMediaId?: string` (max 100), described as "A mediaId from save_photo. Every post uses this photo instead of a generated image."
  - `sourceKind?: "voice" | "photo"`, described as "Set to voice when the idea came from a voice note, or photo when it came from a photo."
- **`prepareDrafting`:**
  - When `imageMediaId` is set, `getMediaAsset(id)` must exist with the same `brandId` and an allowed image type. Otherwise return `{ ok: false, message: "That photo is gone. Send it again." }`.
  - The idea's `sourceKind` is `input.sourceKind`, else `"link"` when there is a source URL, else `"text"`.
  - The idea's `sourceRef` is the first URL, else `imageMediaId`, else `null`.
  - The plan gains `ownerMediaId: string | null`.
- **`runDrafting`:** when `plan.ownerMediaId` is set, it attaches that id to every saved draft and piece with `attachDraftImage` or `attachPieceImage`, and never calls `generateImage`.
- **`generate_image`:**
  - It gains `sourceAttachmentPath?: string`, described as "The path of a photo the owner attached, to edit it."
  - When it is set, `readAttachmentImage(ctx, path)` supplies the `SourceImage`.
  - Passing both `sourceImageUrl` and `sourceAttachmentPath` returns `{ ok: false, message: "Pass sourceImageUrl or sourceAttachmentPath, not both." }`.

- [ ] **Step 1: Write the tests.**
  - `normalizeAttachmentPath("/workspace/.eve/attachments/a/b.jpg")` keeps the path. `"/workspace/.eve/attachments/../secret"` and `"/etc/passwd"` are `null`.
  - `sniffImageType` recognizes the PNG and JPEG magic bytes, and returns `null` for `"hello"`.
  - `readAttachmentImage` returns `"That photo is no longer available. Send it again."` when `readBinaryFile` gives `null`, and `"Only photos can be used."` when the bytes are not an image.
  - `DRAFT_POSTS_INPUT` accepts `imageMediaId` and `sourceKind: "voice"`, and rejects `sourceKind: "video"`.
  - `prepareDrafting` with another brand's media id returns the photo-gone message. With `sourceKind: "voice"`, `createIdea` receives `sourceKind: "voice"`.
  - `runDrafting` with `ownerMediaId: "m1"` calls `attachDraftImage` with `mediaId: "m1"` for each saved draft, and never calls `generateImage`.
- [ ] **Step 2: Run them.** Run `pnpm vitest run lib/media/attachments lib/drafts`. Expected: FAIL for the new cases.
- [ ] **Step 3: Implement.** Keep `save_photo` and `generate_image` thin, because the logic sits in `lib/media/attachments.ts`.
- [ ] **Step 4: Run the checks.** Run `pnpm vitest run lib/media lib/drafts`, `pnpm typecheck` and `pnpm eve:build`. Expected: PASS, with `save_photo` listed.
- [ ] **Step 5: Commit.**
```bash
git add lib/media lib/drafts agent/tools/save_photo.ts agent/tools/generate_image.ts
git commit -m "feat(drafting): use the owner's photo on drafts and edit attached photos"
```

---

### Task 11: submit_for_review, WhatsApp instructions, my- skills and voice recall

**Files:**
- Create:
  - `lib/whatsapp/submit.ts`, `agent/tools/submit_for_review.ts`;
  - `agent/instructions/whatsapp-format.ts`;
  - `lib/skills/dynamic.ts`, `agent/skills/my-skills.ts`.
- Modify: `agent/instructions.md`, `lib/voice/memory.ts`
- Test: `lib/whatsapp/submit.test.ts`, `lib/skills/dynamic.test.ts`, `lib/voice/memory.test.ts`

**Interfaces:**
- Consumes: Task 5's `notifyDraftsReady`, `getDraft`, `listSkills` (`lib/db/skills.ts`) and `defineSkill`.
- Produces:
  ```ts
  // lib/whatsapp/submit.ts
  export type SubmitForReviewInput = { readonly brandId: string; readonly channel: string | null; readonly waId: string | null; readonly ideaId?: string; readonly draftIds?: readonly string[]; readonly resendKey?: string };
  export type SubmitForReviewResult =
    | { readonly ok: true; readonly delivery: "studio" | "cards" | "template" | "duplicate"; readonly sent: number; readonly message: string }
    | { readonly ok: false; readonly message: string };
  export function submitForReview(input: SubmitForReviewInput, deps?: Partial<{ notifyDraftsReady: typeof notifyDraftsReady; getDraft: typeof getDraft }>): Promise<SubmitForReviewResult>;

  // lib/skills/dynamic.ts
  export const MY_SKILLS_MAX = 20;
  export function mySkillEntries(skills: readonly Pick<Skill, "slug" | "name" | "description" | "prompt" | "enabled">[]): { readonly name: string; readonly description: string; readonly markdown: string }[];
  // enabled with a non-empty prompt only; name = "my-" + slug; names must match /^[A-Za-z][A-Za-z0-9_-]{0,63}$/; first 20 by slug order
  // description = skill.description || `The owner's ${skill.name} skill.`
  ```
- **`submitForReview`:**
  - `channel !== "whatsapp"` gives `{ ok: true, delivery: "studio", sent: 0, message: "The drafts are in Studio." }`.
  - With no `waId`, it returns `{ ok: false, message: "This WhatsApp session has no number to send to." }`.
  - With `draftIds`, it loads each draft, ignores missing ones, groups them by `ideaId`, and calls `notifyDraftsReady` once per idea with those ids. With `ideaId`, it makes one call.
  - It sums `sent`. The delivery is `template` if any call used one, else `cards`, and `duplicate` only when every call was a duplicate.
  - Messages:
    - cards: `Sent ${n} review card${n === 1 ? "" : "s"}.`;
    - template: "WhatsApp only allows a template message right now, so harpy sent a notification. The owner taps Review to see the cards.";
    - duplicate: "Those cards were already sent.";
    - a `notifyDraftsReady` failure passes its `message` through as `ok: false`.
- **`submit_for_review` tool:**
  - Input: `z.object({ ideaId: z.string().max(100).optional(), draftIds: z.array(z.string().max(100)).min(1).max(10).optional(), resend: z.boolean().optional() })`, refined so that exactly one of `ideaId` and `draftIds` is set.
  - It reads `brandId` through `resolveBrandContext(ctx)`, and `channel` and `waId` from `ctx.session.auth.current?.attributes`.
  - `resendKey = input.resend ? ctx.callId : undefined`.
  - Description: "Send saved drafts to the owner for review. On WhatsApp this sends one review card per draft with Approve, Edit and Skip. Elsewhere the drafts are already in Studio. Pass the ideaId from draft_posts, or the draftIds from revise_draft. Set resend when the owner asks to see cards again."
- **`agent/instructions/whatsapp-format.ts`** is a `defineDynamic` on `"turn.started"`. It returns `null` unless `ctx.session.auth.current?.attributes.channel === "whatsapp"`. Otherwise it returns `defineInstructions({ content })` with exactly:
  ```
  This conversation is on WhatsApp.
  - Keep replies short: one to three sentences.
  - No headings, tables or markdown links. Write a link as the bare URL.
  - Before a tool that takes a while, such as draft_posts or revise_draft, write one short line saying what you are doing.
  - Never paste drafts into the chat. After draft_posts or revise_draft saves drafts, call submit_for_review with the ideaId or the draftIds, then end the turn without more text.
  - When the owner sends a photo, call save_photo with its attachment path. Pass the mediaId to draft_posts as imageMediaId when the photo belongs on the posts, or pass the path to generate_image as sourceAttachmentPath to edit it.
  - A transcribed voice note is the owner's own words. Pass sourceKind "voice" to draft_posts when the idea came from one.
  ```
- **`agent/instructions.md`.** Add one paragraph to the Drafting section: "On WhatsApp, drafts reach the owner through submit_for_review as review cards. On the web and in Slack they appear in Studio, and submit_for_review only confirms that." Change nothing else.
- **`agent/skills/my-skills.ts`** is a `defineDynamic` from `eve/skills` on `"turn.started"`:
  - `userId = ctx.session.auth.current?.principalId`. With no `brandId` attribute, or no user, return `null`.
  - Otherwise return a map from each `mySkillEntries(await listSkills(userId))` entry's `name` to `defineSkill({ description, markdown, deferred: true })`. An empty list gives `null`. Errors are logged and give `null`.
- **The voice recall fix** (`lib/voice/memory.ts`). `buildVoiceRecall` returns exactly two messages:
  - `{ id: "voice:preferences", content }`, where `content` is `"Owner preferences:\n- " + texts.join("\n- ")`, or `"The owner has stated no writing preferences."` when there are none;
  - `{ id: "voice:examples", content }`, with each example as `"An example of the owner's past <label> writing:\n<text>"` joined by `"\n\n"`, or `"No example posts are saved."` when there are none.

  The keys stay stable across turns, so each turn's recall supersedes the last.

- [ ] **Step 1: Write `lib/whatsapp/submit.test.ts`.**
  - `channel: "web"` gives `studio`, and `notifyDraftsReady` is not called.
  - WhatsApp with `ideaId: "i1"` calls `notifyDraftsReady` with `{ brandId, waId, ideaId: "i1", draftIds: undefined, resendKey: undefined }`.
  - `draftIds` spanning ideas `i1` and `i2` makes two calls.
  - The delivery is `template` when one call returns a template, and `duplicate` only when every call is a duplicate.
  - A missing `waId` gives `ok: false`.
- [ ] **Step 2: Write `lib/skills/dynamic.test.ts`.**
  - Disabled skills and skills with an empty prompt are skipped.
  - The slug `"hooks"` gives the name `"my-hooks"`.
  - A slug that makes an invalid name is skipped.
  - At most 20 entries come back.
  - The description falls back when empty.
- [ ] **Step 3: Update `lib/voice/memory.test.ts`.** It checks the two keyed messages and both empty-state texts.
- [ ] **Step 4: Run them.** Run `pnpm vitest run lib/whatsapp/submit lib/skills lib/voice/memory`. Expected: FAIL.
- [ ] **Step 5: Implement the modules, the tool, the dynamic instruction, the dynamic skills file, and the instructions paragraph.**
- [ ] **Step 6: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm eve:build`. Expected: PASS. `eve build` lists `submit_for_review`, the `whatsapp-format` instructions and the dynamic skills file.
- [ ] **Step 7: Commit.**
```bash
git add lib/whatsapp lib/skills lib/voice agent
git commit -m "feat(agent): submit_for_review, whatsapp reply rules, my- skills and keyed voice recall"
```

---

### Task 12: Slack identity

**Files:**
- Create: `lib/slack-auth.ts`
- Modify: `agent/channels/slack.ts`
- Read first: `node_modules/eve/docs/channels/slack.mdx` (the four hooks and the allowlist example) and `node_modules/eve/dist/src/public/channels/slack/slackChannel.d.ts`
- Test: `lib/slack-auth.test.ts`

**Interfaces:**
- Consumes: Task 3's `resolveChannelAuth`, `parseLinkCommand` and `redeemLinkCode`.
- Produces:
  ```ts
  // lib/slack-auth.ts
  export const SLACK_COPY = {
    linked: (email: string) => `Linked. harpy knows you as ${email}.`,
    linkFailed: "That code didn't work. Make a new one on harpy's Channels page.",
    unlinked: "Link your Slack account first: open Channels in harpy, choose Link Slack, and send me the code here.",
  } as const;
  export function slackExternalId(auth: SessionAuthContext | null): string | null; // "<team>:<user>" from attributes.team_id (else issuer "slack:<team>") and attributes.user_id
  export function resolveSlackAuth(defaultAuth: SessionAuthContext | null): Promise<SessionAuthContext | null>;
  // resolveChannelAuth({ channel: "slack", externalId, extraAttributes: string-valued attributes of defaultAuth })
  export type SlackInboundDecision = { readonly kind: "turn"; readonly auth: SessionAuthContext } | { readonly kind: "reply"; readonly text: string } | { readonly kind: "drop" };
  export function decideSlackInbound(input: { readonly defaultAuth: SessionAuthContext | null; readonly text: string; readonly isDirect: boolean; readonly isMention: boolean }): Promise<SlackInboundDecision>;
  ```
- **`decideSlackInbound`:**
  1. **Link command,** in DMs only. `parseLinkCommand(text)` gives a code: `redeemLinkCode({ channel: "slack", externalId, code })` replies `SLACK_COPY.linked` or `SLACK_COPY.linkFailed`.
  2. **Linked:** `auth = resolveSlackAuth(defaultAuth)` gives a `turn`.
  3. **Unlinked:** a DM or mention replies `SLACK_COPY.unlinked`; anything else is `drop`.
- **`agent/channels/slack.ts`** keeps `credentials` and `uploadPolicy`, and adds four hooks:
  - `onDirectMessage(ctx, message)`, `onAppMention(ctx, message)` and `onMessage(ctx, message)`:
    - `defaultSlackAuth(message, ctx)`, then `decideSlackInbound`;
    - `turn` returns `{ auth }`;
    - `reply` posts the text with `ctx.slack.request("chat.postMessage", { channel: ctx.slack.channelId, thread_ts: ctx.slack.threadTs, text })` and returns `null`;
    - `drop` returns `null`.
  - `onInputResponse(ctx)` returns `{ auth }` from `resolveSlackAuth(ctx.defaultAuth)`, or `null`, so a resumed approval keeps the same principal.
  - Confirm each signature against the `.d.ts`, and note any difference in the report.

- [ ] **Step 1: Write `lib/slack-auth.test.ts`.** Mock Task 3.
  - `slackExternalId({ ..., attributes: { user_id: "U1", team_id: "T1" } })` is `"T1:U1"`. With no `team_id` and `issuer: "slack:T9"`, it is `"T9:U1"`. With no `user_id`, it is `null`.
  - `resolveSlackAuth` passes `externalId: "T1:U1"` and only the string-valued attributes.
  - `decideSlackInbound`:
    - a linked user gives a `turn`;
    - an unlinked DM replies `SLACK_COPY.unlinked`;
    - an unlinked plain channel message is a `drop`;
    - `"LINK 123456"` in a DM with a valid code replies `SLACK_COPY.linked("owner@example.com")`;
    - the same text in a channel mention is not treated as a link command.
- [ ] **Step 2: Run it.** Run `pnpm vitest run lib/slack-auth`. Expected: FAIL.
- [ ] **Step 3: Implement `lib/slack-auth.ts` and the four hooks.**
- [ ] **Step 4: Run the checks.** Run `pnpm vitest run lib/slack-auth`, `pnpm typecheck` and `pnpm eve:build`. Expected: PASS.
- [ ] **Step 5: Commit.**
```bash
git add lib/slack-auth.ts lib/slack-auth.test.ts agent/channels/slack.ts
git commit -m "feat(slack): map linked slack users to the owner's principal, including approvals"
```

---

### Task 13: Channels page and Send to WhatsApp

**Files:**
- Create: `app/actions/channels.ts`, `app/(app)/channels/_components/messaging-section.tsx`, `lib/channels/view.ts`
- Modify:
  - `app/(app)/channels/_components/channels-view.tsx` (the Messaging section uses the new component);
  - `app/(app)/layout.tsx`, `app/_components/agent-chat-bootstrap-sync.tsx`, `app/_components/chat-shell-context.tsx`, `app/_components/app-shell.tsx` and `app/_components/app-sidebar.tsx` (`whatsappConfigured`, passed exactly like `slackConfigured`);
  - `lib/studio/types.ts`, `lib/studio/snapshot.ts`, `app/api/studio/route.ts` and `lib/studio/test-fixtures.ts` (`whatsappLinked`);
  - `app/actions/studio.ts` (`sendIdeaToWhatsAppAction`);
  - `app/(app)/_components/studio/idea-item.tsx` and `studio-view.tsx` (the button and its toast).
- Test: `lib/channels/view.test.ts`, `lib/studio/snapshot.test.ts`

**Interfaces:**
- Consumes:
  - Task 2's `listIdentitiesForBrand`, `unlinkIdentity` and `findWhatsAppRecipient`;
  - Task 3's `createLinkCode`;
  - Task 5's `notifyDraftsReady`;
  - `getWhatsAppConfig` and `waMeLink`;
  - `QRCode.toString(url, { type: "svg", margin: 1 })` from `qrcode`.
- Produces:
  ```ts
  // lib/channels/view.ts (pure, for the UI and its tests)
  export type LinkedRow = { readonly id: string; readonly channel: ChannelIdentityKind; readonly label: string; readonly linkedOn: string };
  export function linkedRow(identity: LinkedIdentity): LinkedRow; // whatsapp label "+<digits>" (or the bsuid); slack label "Slack user <userId part>"; linkedOn "Oct 25" (UTC)
  export function sendToWhatsAppMessage(result: NotifyResult): string;
  // cards: "Sent 1 card to WhatsApp." / "Sent 3 cards to WhatsApp."; template: "Sent a notification to WhatsApp. Tap Review there to see the cards.";
  // duplicate: "Those cards were already sent."; nothing_to_review: "Nothing here is waiting for review."; not_configured: "WhatsApp isn't set up yet."; send_failed: the result's message

  // app/actions/channels.ts ("use server"; viewer and brand as in app/actions/studio.ts)
  export function listLinkedChannelsAction(): Promise<{ ok: true; whatsappConfigured: boolean; slackConfigured: boolean; rows: LinkedRow[] } | { ok: false; message: string }>;
  export function createLinkCodeAction(input: { channel: ChannelIdentityKind }): Promise<{ ok: true; code: string; expiresAt: string; waLink: string | null; qrSvg: string | null } | { ok: false; message: string }>;
  export function unlinkChannelAction(input: { id: string }): Promise<{ ok: true } | { ok: false; message: string }>;

  // app/actions/studio.ts
  export function sendIdeaToWhatsAppAction(input: { ideaId: string }): Promise<{ ok: boolean; message: string }>;
  // recipient = findWhatsAppRecipient(brandId, viewer.id); none -> "Link your phone on the Channels page first."
  // notifyDraftsReady({ brandId, waId, ideaId, resendKey: randomUUID() }), because an owner's explicit send always goes out
  ```
- **The Messaging section:**
  - **WhatsApp card:**
    - When not configured, it reads "Not set up yet. The setup guide is docs/whatsapp-setup.md."
    - Linked numbers are listed, each with an Unlink `ConfirmActionButton`: title "Unlink this number?", body "harpy will stop answering this number until you link it again.", confirm "Unlink".
    - "Link a phone" shows the code panel: "Send this to harpy on WhatsApp within 10 minutes:", then the code as `LINK 123456` in mono type. With `waLink`, an "Open WhatsApp" link. With `qrSvg`, the QR, labelled "Or scan this with your phone's camera."
  - **Slack card:** the same pattern. "Link Slack" shows "In Slack, send harpy a direct message within 10 minutes:" and the code. There is no QR.
  - **Errors:**
    - `LinkCodeUnavailableError` reads "Linking needs Redis, which isn't set up.";
    - `RateLimitError` reads "Too many codes. Try again in an hour.".
- **The sidebar pill** for WhatsApp shows "connected" when `whatsappConfigured` is true (`isWhatsAppConfigured()`, read in the layout like `SLACK_CONNECTOR`).
- **Studio:**
  - `StudioSnapshot` gains `readonly whatsappLinked: boolean`, true when WhatsApp is configured and the viewer has a linked number.
  - `IdeaItem` shows a "Send to WhatsApp" button when `whatsappLinked` is true and the idea has at least one `pending_review` draft.
  - The button shows "Sending..." while pending, then a toast with the action's message.
  - The QR SVG comes from the `qrcode` library and is rendered with `dangerouslySetInnerHTML`. It holds no user input beyond the digits-only wa.me link.

- [ ] **Step 1: Write `lib/channels/view.test.ts`.**
  - `linkedRow` for WhatsApp `15551234567` gives the label `"+15551234567"`, and for Slack `T1:U1` gives `"Slack user U1"`.
  - `sendToWhatsAppMessage` returns each of the six messages exactly, including the singular "Sent 1 card to WhatsApp.".
- [ ] **Step 2: Update `lib/studio/snapshot.test.ts` and the fixtures** so the snapshot carries `whatsappLinked`.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/channels lib/studio`. Expected: FAIL.
- [ ] **Step 4: Implement the view helpers, actions, components and wiring.** Use the existing `Card`, `Button`, `ConfirmActionButton` and `ChannelStatusPill` components and the type tokens. No arbitrary pixel values.
- [ ] **Step 5: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Expected: PASS.
- [ ] **Step 6: Commit.**
```bash
git add app lib/channels lib/studio
git commit -m "feat(channels): link whatsapp and slack with codes, and send studio ideas to whatsapp"
```

---

### Task 14: Docs, runbook and owner checklist

**Files:**
- Create: `docs/whatsapp-setup.md`
- Modify: `docs/setup-and-deploy.md`, `docs/how-the-chatbot-works.md`, `README.md`, `.env.example`, `.agents/skills/eve-chat-template-eve/SKILL.md` (only if it describes channels)

**Content decisions:**
- **`docs/whatsapp-setup.md`** is the Meta runbook, written for the owner as numbered steps:
  1. Create a Business-type Meta app at developers.facebook.com and add the WhatsApp product.
  2. Use the free test number. Note the Phone number ID and the WhatsApp Business Account ID, and add and verify the owner's phone as a test recipient.
  3. Create a System User with admin access to the app and the WhatsApp account. Generate a never-expiring token with `whatsapp_business_messaging` and `whatsapp_business_management`.
  4. Copy the App secret from App settings, Basic.
  5. Pick a random verify token.
  6. In Vercel (production and preview), set:
     - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` and `WHATSAPP_BUSINESS_ACCOUNT_ID`;
     - `HARPY_WHATSAPP_ALLOWED_NUMBERS` (the owner's number, digits);
     - `HARPY_WHATSAPP_NUMBER` (the test number, digits).

     Check that `REDIS_URL` is a `rediss://` URL. Redeploy.
  7. Set the webhook to `https://eve-harpy.vercel.app/eve/v1/whatsapp` with the verify token, and subscribe to `messages` and `user_id_update`.
  8. Create the seven Utility templates in WhatsApp Manager, in English (`en`), copying the table from Task 4 word for word, including the quick-reply buttons. Submit them for approval.
  9. From the owner's phone, send "hi" to the test number.
  10. For local development, use a tunnel such as `cloudflared tunnel --url http://localhost:3000` and point a separate Meta test app at it. Never point the production app at a tunnel. Preview deployments sit behind Deployment Protection and can't receive webhooks.
  11. Optional: move to a dedicated number. Register it, get the display name approved, add a payment method, and change `WHATSAPP_PHONE_NUMBER_ID`; nothing else changes.
- **`docs/setup-and-deploy.md`** gets a "Stage 3" section:
  - the new env vars;
  - migration 0011 (`! pnpm db:migrate:production`, additive, safe before the merge);
  - the Redis TCP URL note;
  - the owner checklist below.
- **Stage 3 owner checklist** (the spec's "done when"):
  1. With your number in `HARPY_WHATSAPP_ALLOWED_NUMBERS`, send harpy "hi". It answers.
  2. Send a voice note: "a post about why small teams ship faster". You get one short line, then a review card per platform, with an image where one was made and a footer like "LinkedIn · 612 chars".
  3. Tap Approve on one card. You get "Approved the ... draft", and Studio shows it under Up next.
  4. Tap Edit on another card, then answer with a voice note: "make it shorter". A new card comes back.
  5. Tap Skip on the third card. You get "Skipped the ... draft".
  6. Tap Approve on the old card from step 4. You get "That draft changed. Showing the latest." and the current card.
  7. From a phone that isn't linked, send harpy a message. Nothing comes back.
  8. Send a photo with the caption "post this with a line about our offsite". The drafts use your photo.
  9. Don't message harpy for 24 hours, then use "Send to WhatsApp" on an idea in Studio. The `harpy_drafts_ready` template arrives, and tapping Review sends the cards. As a faster check, delete the key `wa:window:<your number>` in the Upstash data browser.
  10. On the Channels page, choose Link Slack, then DM harpy in Slack `LINK <code>`. Then ask in Slack "draft a LinkedIn post about our hiring mistakes". It appears in Studio as "via Slack", and your Brand voice preferences apply.
  11. Send `/new`. You get "Started a new conversation." If nothing comes back, `/new` doesn't work on this eve version. Tell the builder, who removes the command.
- **`docs/how-the-chatbot-works.md`** gets a "WhatsApp" section:
  - the inbound order from Task 7;
  - the buttons and the edit marker;
  - the outbox and template fallback;
  - the statuses wrapper;
  - why cards bypass the Chat SDK;
  - Slack identity.
- **`.env.example`** adds the seven WhatsApp variables, with one comment line each.
- **`README.md`** adds one line under features, and a link to the runbook.

- [ ] **Step 1: Write `docs/whatsapp-setup.md`** with the steps above. Copy the template table from `lib/whatsapp/templates.ts`, so the two can't disagree.
- [ ] **Step 2: Update `docs/setup-and-deploy.md`, `docs/how-the-chatbot-works.md`, `README.md` and `.env.example`.**
- [ ] **Step 3: Run the final checks.** Run `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm eve:build`. Expected: all pass.
- [ ] **Step 4: Commit.**
```bash
git add docs README.md .env.example .agents
git commit -m "docs: whatsapp runbook, stage 3 setup and owner checklist"
```
