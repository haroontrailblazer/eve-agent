# harpy v2: content studio and social media operator

Design document, 2026-10-22. Status: draft for review.

Research behind this document (eve 0.82 docs and types, the WhatsApp Chat SDK adapter source, platform API docs, a full repo map) was done on 2026-10-22. Where a fact matters and was not verified, it says UNVERIFIED.

Marking used below:
- **Decided by the owner**: the person who owns harpy said so in the design conversation.
- **Builder's call (made in this doc)**: a choice made while writing this document. The owner has not agreed to it yet. They can overrule it.
- **Left to the builder**: no constraint either way.

---

## 1. Intent

harpy today is a test app: a web chat on top of the eve framework, with image generation, custom skills, MCP connections (Notion, Linear, Sentry, DeepWiki), placeholder X/LinkedIn/Threads connections that point at servers that don't exist, and a Slack channel.

harpy v2 turns it into the owner's **personal content studio and social media operator** (decided by the owner). The owner messages it from wherever they are, and it does the work of a small content team:

- takes a rough idea, a link, a photo or a voice note,
- writes posts for X, LinkedIn and Threads in the owner's own voice,
- makes the images,
- and publishes **only after the owner approves**.

WhatsApp is the main way the owner talks to harpy (decided by the owner). The web app becomes the control room. Slack stays.

### Why

The owner wants one place that turns thinking into published posts without the busywork. They also don't want to babysit three platforms or sound like a generic AI.

### What success looks like

- The owner sends a voice note on WhatsApp while walking. A few minutes later they get one review card per platform, with image, and tap Approve. The posts go out at good times.
- Drafts read like the owner wrote them. Edits get rarer over time because harpy learns from them.
- Every morning the owner gets a short brief with what's moving in their niche and a few post ideas they can approve on the spot.
- The web app shows at a glance what's drafted, scheduled, published and waiting for a reply.

---

## 2. Goals, non-goals, anti-goals

### Goals (decided by the owner, from the playback they confirmed)

1. **Writes in the owner's voice.** It learns from past posts and the owner's rules, and puts extra effort into hooks.
2. **One idea, every platform.** A single input becomes an X post or thread, a LinkedIn post and a Threads post. Each is shaped for its platform, with matching images.
3. **Nothing goes live without approval.** Every draft is previewed with Approve / Edit / Skip.
4. **Content calendar.** Scheduled posts can be seen and moved in the web app.
5. **One inbox.** Mentions and replies from all platforms in one list, with drafted responses to approve.
6. **Morning brief.** Each day: trends in the owner's niche plus a few post ideas, sent to WhatsApp.
7. **What worked.** A weekly summary of which posts did well and why.
8. **Repurposing.** A video link, blog post or voice note becomes posts, a reel script or a carousel outline.
9. **Single owner first, multi-brand later.** Built so more brands or clients can be added without a rewrite. My guess, which the owner confirmed.
10. **Reachable from WhatsApp (main), the web app and Slack.**
11. **A real design system based on the current silver look** (decided by the owner, section 7).

### Non-goals for v2

- Instagram, TikTok, YouTube, Facebook. They might come later through the same provider layer.
- Agency features: client approval portals, team roles, billing. The data model leaves room for them (`brand` table), but no UI.
- Video generation or editing. A reel script is text.
- Paid ads.
- A mobile app. WhatsApp is the mobile surface.

### Anti-goals (a failure even if everything technically works)

- **harpy posts something the owner didn't approve.** Approval is a deterministic button tap or click, never something the model decides. The model has no publish tool in v2.
- **Drafts read like AI.** Generic hooks, "delve", em-dash-heavy rhythm, hashtag stuffing.
- **The owner's WhatsApp number gets banned.** Only Meta's official Cloud API is used; no unofficial libraries.
- **Surprise bills.** These come from X link posts ($0.20 each), WhatsApp template spam, runaway model sessions, or a photo sandbox per message. Guards are in section 10.
- **The web app feels like five different apps.** Every page uses the same tokens and components.

---

## 3. The experience

### 3.1 Idea to published post (WhatsApp)

1. The owner sends harpy something on WhatsApp: text, a voice note, a photo, a link, or several at once.
   - Voice notes are transcribed before the agent sees them.
   - Photos and documents reach the agent as attachments.
2. harpy replies once with a short line ("On it, drafting X, LinkedIn and Threads").
   - It runs the drafting workflow (section 8.4).
   - The writer subagent drafts each platform in parallel, in the brand voice, using the hook and platform skills.
   - Images are generated where they help.
3. harpy sends **one review card per draft**. Each card is a single WhatsApp interactive message:
   - the image as the header (if any),
   - the post text as the body (up to 1024 characters),
   - a footer like "LinkedIn · 612 chars · Tue 9:30 AM",
   - three buttons: **Approve**, **Edit**, **Skip**.

   LinkedIn drafts over 1024 characters go out as a full-text message first, followed by a card that shows an excerpt.
4. The owner taps a button:
   - **Approve:** the draft is scheduled at its suggested time, or published now if it has none. harpy confirms ("Scheduled for Tue 9:30 AM" or "Posted to LinkedIn: <url>"). No model turn happens.
   - **Edit:** harpy asks "What should I change?". The owner's next message (text or voice) is applied to that draft, and a new card comes back.
   - **Skip:** the draft is marked skipped. No model turn happens.
5. Published posts appear in the calendar and Studio with their live URL. If publishing fails, harpy says so on WhatsApp with a Retry button.

The same drafts can also be approved, edited or skipped from the web Studio. Both surfaces change the same database rows.

### 3.2 Morning brief

- Each day at the owner's chosen local time (default 7:30), harpy researches the owner's niche in the background and saves a brief: 3 to 5 trends and 3 to 5 post ideas.
- WhatsApp then gets a notification:
  - **If the owner messaged harpy in the last 24 hours:** a normal message with the brief and buttons.
  - **If not:** an approved template, "Your content brief for Thu 22 Oct is ready: 3 trends and 5 post ideas", with a **Show brief** button. Tapping it reopens the 24-hour window, and harpy sends the brief.
- Each idea in the brief can be turned into drafts by replying with its number, or with the "Draft #2" quick action in the web Brief page.

### 3.3 Inbox

- harpy checks X and Threads every 15 minutes for mentions and replies.
- It sorts each one into **needs reply**, **FYI** or **ignore**.
- For items that need a reply, it drafts one in the owner's voice.
- WhatsApp gets at most a few batched notifications a day ("4 new replies, 2 may need a response").
- Reply drafts use the same Approve / Edit / Skip flow.
- LinkedIn comments on personal profiles cannot be read through any API a small developer can get (section 9). The inbox shows LinkedIn as "open in LinkedIn" only.

### 3.4 Weekly summary

Monday morning, harpy summarizes the past week:
- top posts and why they worked (hook, format, time, topic),
- what flopped,
- one or two suggestions,
- an updated voice guide proposal if it learned something.

It's delivered like the brief.

### 3.5 Repurposing

The owner sends a long source:
- a blog or article link,
- a YouTube link,
- a voice note,
- or pasted text or a transcript.

harpy produces any of these:
- platform drafts, which go through the normal review flow,
- a **reel script** (hook, beats, on-screen text, caption),
- a **carousel outline** (slide-by-slide text plus a cover image).

Reel scripts and carousel outlines are saved in Studio as content pieces. They are never published.

### 3.6 Web control room

- **Studio** is the home page. It has an idea input at the top. Ideas are shown in a list, each with its platform drafts as cards (status, text, image, time, Approve / Edit / Skip). A right rail shows today's brief and the next posts coming up.
- **Calendar:** a week view and a list view of scheduled and published posts. Click a post to reschedule it with a date and time picker. Drag-to-reschedule is left to the builder for later.
- **Inbox:** mentions and replies by platform, with filters (needs reply, all, done) and drafted replies.
- **Brief:** today's brief and past briefs, plus a "draft this" action per idea.
- **Brand voice:** the voice guide (versioned, editable), example posts, stated preferences, and proposals harpy learned from edits that the owner can accept or reject.
- **Channels:** connect and check the status of X, LinkedIn, Threads, WhatsApp and Slack. MCP connections and skills move here and to Settings from the current Profile page.
- **Chat:** the existing free-form web chat with harpy, kept and rebuilt on eve 0.82.
- **Settings:** account, time zone, brief time, theme (system, light or dark), custom skills.

Keyboard shortcuts in Studio, Inbox and Calendar: `J`/`K` to move, `A` approve, `E` edit, `S` skip, `?` for help. These were borrowed from the Night studio mockup (my guess at why the owner clicked it, which the owner confirmed).

---

## 4. Constraints

### 4.1 Project constraints

- **Stay on eve.** Before writing code, read the relevant guide in the eve package docs. In eve 0.82 these ship at `node_modules/eve/docs/`, not `node_modules/eve/dist/docs/public/` as `AGENTS.md` currently says; fix that path in Phase 1. Write "eve" in lowercase everywhere.
- **Stack stays:** Next.js 16, React 19, Tailwind 4, shadcn (new-york), Better Auth ("Sign in with Vercel"), Drizzle + Neon (neon-http), Upstash Redis, Vercel hosting, pnpm.
- **Development machine:** Windows 11. Scripts must work in Git Bash and PowerShell.
- **The current env** has Neon and Upstash (`KV_REST_API_*`, `KV_URL`, `REDIS_URL`) but no Better Auth or AI Gateway credentials locally. The project isn't linked locally (no `.vercel/`). The Vercel CLI is logged in.

### 4.2 Platform realities that shape the design (researched 2026-10-22)

| Platform | Reality | Consequence |
|---|---|---|
| **X** | Pay-per-use only. Post $0.015; **post with a URL $0.20**; own mentions and timeline reads $0.001 each (owned reads, when the developer app belongs to the owner). Since 2026-02-23, API replies are only allowed to accounts that @mentioned or quoted the owner ("summoned"). Metrics for own posts are only available for the last 30 days. OAuth 2.0 PKCE; access tokens last 2 hours; refresh tokens need `offline.access` (assume they rotate). | The owner creates their own X developer app and buys credits. The rough cost is $3 to $15 a month. Drafting keeps links out of X posts by default and shows the cost when one is included. Inbox replies on X only target summoned posts; anything else is "reply manually". |
| **LinkedIn** | Self-serve "Share on LinkedIn" (`w_member_social`) lets you post text and images to a personal profile. Reading comments (`r_member_social`) is closed. Post analytics need the vetted Community Management API (registered companies only). No refresh tokens, so the owner must log in again every 60 days. API versions retire on a schedule (202511 retires 2026-11-16). | **Decided by the owner:** post directly to the owner's **personal profile**, with no third party. LinkedIn in harpy is posting only: no inbox, no metrics. A re-login reminder comes before the token expires. |
| **Threads** | Free. In tester mode the app owner's own account gets every permission without App Review: publish, reply, mentions, insights. Images must be at a **public URL** (no upload). Tokens last 60 days and can be refreshed (once they're over 24 hours old). Webhooks need a Live app and a verified business. | Direct integration in tester mode. Images go to public Blob storage. Mentions and replies are polled, not pushed. |
| **WhatsApp** | Official Cloud API only. Free-form messages only within 24 hours of the owner's last message; outside that window, only Meta-approved templates. From 1 Oct 2026: 1,000 free service messages per number per month, then paid; utility templates are paid even inside the window. Interactive messages allow at most 3 reply buttons (titles up to 20 characters, body up to 1024). Messages can't be edited or deleted. Meta's test number can message a handful of verified numbers (about 5, UNVERIFIED). | One message per turn. One card per draft. Notifications go through an outbox that picks a service message or a template. A runbook for templates and the Meta app. Webhooks need a public HTTPS URL: production, or a tunnel for local development. |
| **Vercel (Hobby plan, decided by the owner)** | <ul><li>Crons run at most once a day, to within about ±59 minutes; more frequent cron expressions **fail the deployment**.</li><li>Function maximum duration is 300 seconds.</li><li>Included usage: **50,000 Workflow events a month** (eve sessions run on Vercel Workflow), 4 active CPU-hours, and 500 Connect token requests (Slack and Notion through Vercel Connect).</li><li>If usage limits are exceeded, the feature can pause until 30 days have passed.</li><li>Hobby is for personal, non-commercial use under Vercel's fair use rules.</li></ul> | <ul><li>No eve `defineSchedule` at all. Upstash QStash drives every job (section 8.7).</li><li>Routine checks (polling, refresh, outbox) are plain code and use no agent sessions. Model work only runs when there is something to do.</li><li>Steps run under 300 seconds.</li><li>Workflow-event usage is shown in Settings so the owner sees a limit coming (section 8.10).</li></ul> |
| **eve 0.82** | eve's private sessions (WhatsApp DMs, signed-in web sessions) keep no transcript once they end. Scheduled sends can't take an `idempotencyKey`. Every inbound file is staged in a sandbox (Vercel Sandbox on Vercel). Static model ids are checked against the AI Gateway catalog at build time. | The app database owns all durable product state. Duplicates are prevented in Postgres. Photo-heavy usage has a sandbox cost. Run `eve build` early to validate model ids. |

---

## 5. Architecture overview

```
                    ┌──────────────── eve agent (agent/) ────────────────┐
WhatsApp ──webhook──▶ channels/whatsapp.ts (Chat SDK + WhatsApp adapter)  │
Web (control room) ─▶ channels/eve.ts  (Better Auth)                      │
Slack ─────────────▶ channels/slack.ts (Vercel Connect)                   │
Background jobs ───▶ channels/jobs.ts  (route-less, receive() only)       │
                    │                                                     │
                    │  root agent (Sonnet 5.5)  ── skills/ (hooks,        │
                    │   instructions + dynamic       platforms, brief,    │
                    │   brand-voice instructions     repurpose, replies)  │
                    │   memory/voice.ts (brand-scoped, Postgres-backed)   │
                    │   tools/ draft_posts (workflow) ─▶ subagents/writer │
                    │          submit_for_review, revise_draft, ...       │  (Opus 5.5)
                    │   subagents/researcher (brief, trends)              │
                    └─────────────────────┬───────────────────────────────┘
                                          │ reads/writes
                         ┌────────────────▼──────────────────┐
                         │ Postgres (Neon): brands, drafts,  │
                         │ posts, jobs, outbox, inbox, voice,│
                         │ social accounts (encrypted), media│
                         └───────┬──────────────┬────────────┘
     deterministic, no model:    │              │
     lib/review (approve/skip)   │              │ lib/jobs dispatcher
     lib/social/* providers ◀────┘              │  (publish, poll inbox, metrics,
     lib/whatsapp/* (cards, templates, window)  │   token refresh, brief, weekly,
     Vercel Blob (public media)                 │   outbox)  ◀── trigger: QStash (8.7)
```

The rule underneath all of this: **the model writes and reads; plain code approves, schedules, publishes and notifies.**

---

## 6. Phase plan

Each phase ends deployed, working and verified. Each later phase depends on the earlier ones.

| Phase | Contents | Done when |
|---|---|---|
| **1. Foundation** | The eve 0.82 upgrade and web chat rewrite (8.1); design tokens, shadcn primitives and the new app shell with sidebar (section 7); `brand` and identity model (8.2); public Blob media (8.8); security fixes and dead-code cleanup (8.11); harpy instructions rewrite | Existing chat works on 0.82 (send, follow-up, refresh mid-stream, stop, Notion sign-in resumes the same turn, attachments, image generation and editing). `pnpm typecheck` and `pnpm build` pass. The control room shell shows Studio, Calendar, Inbox, Brief, Brand voice, Channels, Chat and Settings (empty states where not built yet). The `/design` reference page renders every token and component in light and dark mode. |
| **2. Studio and drafting** | The draft data model and state machine (8.5); the writer subagent, `draft_posts` workflow, skills (8.4); the Studio page with Approve / Edit / Skip on the web; Brand voice v1 (onboarding from pasted examples, guide editor, preferences); repurposing from links and pasted text | An idea typed in Studio produces three platform drafts in the brand voice, with images where useful. They can be approved, edited or skipped. Edits are stored for learning. Evals for length, banned phrases and hook quality pass (8.12). |
| **3. WhatsApp** | WhatsApp channel, linking, inbound text, voice, photo and link handling, review cards, Edit flow, `/new` (8.3); the outbox, the 24-hour window and templates (8.7); Slack identity mapping; a Meta setup runbook | From a linked phone: a voice note leads to review cards. Approve, Edit and Skip work, and Edit takes a voice reply. Unknown numbers get no reply. A notification sent outside the window goes out as a template. All three channels resolve to the same owner and brand. |
| **4. Publishing and calendar** | Social accounts and OAuth for X, Threads and LinkedIn (8.6); the publish pipeline with idempotency; the jobs dispatcher (8.7); the Calendar page; published and failed notifications; token refresh and re-login reminders | Approving a draft publishes it to the real account within about a minute of its scheduled time. A failure is retried and then reported on WhatsApp with Retry. An X thread posts as a chain. Threads gets an image post. The calendar reflects every state. |
| **5. Inbox, brief, insights, learning** | Inbox polling, triage and reply drafts; the morning brief (background session, researcher, saved brief, notification); metrics snapshots and the weekly summary; the voice learning loop (weekly proposal from edits and top posts) | Every item in section 3 works end to end for a week of real use. |

The plan for each phase gets written separately (superpowers:writing-plans) when that phase starts.

---

## 7. Design system

**Decided by the owner:** keep the existing silver look as the base:
- neutral greys (chroma 0), light and dark mode,
- Geist and Geist Mono,
- the Orbitron "harpy" wordmark,
- the winged orb logo and its animations.

No new brand colors and no gradients.

What changes is that the look becomes a written system. Everything in this section was in the playback the owner confirmed.

### 7.1 Tokens (in `app/globals.css`, Tailwind 4 `@theme inline`)

- **Keep all existing tokens:** background, foreground, card, popover, primary, secondary, muted, accent, destructive, border, input, ring, radius.
- **Add functional color, used only as small glyphs and dots, never as surface fills.** Values are left to the builder, but each one must meet WCAG AA as a 3:1 non-text glyph against card and background in both modes. Suggested starting points: status review amber, scheduled blue, posted green, failed red. Draft stays neutral.
  - status: `--status-draft`, `--status-review`, `--status-scheduled`, `--status-posted`, `--status-failed`
  - platform: `--platform-x` (foreground), `--platform-linkedin` (#0A66C2), `--platform-threads` (foreground), `--platform-whatsapp` (#25D366), `--platform-slack` (#4A154B, a lighter tint in dark mode)
- **Type scale tokens** replace the arbitrary sizes in the code (`text-[15px]` appears 12 times, plus `text-[13px]`, `text-[11px]` and `text-[10px]`): `--text-display`, `--text-title`, `--text-heading`, `--text-body` (15px), `--text-small` (13px), `--text-meta` (11px, Geist Mono for times, counts and ids).
- **Spacing:** a 4/8px scale (Tailwind defaults). No arbitrary pixel values outside `components/ui`.
- **Radius:** keep `--radius` 0.625rem and its scale. Replace `rounded-[14px]` and `rounded-[18px]` with tokens.
- **Elevation:** a hairline border plus at most one soft shadow token (`--shadow-raised`) for cards and popovers.
- **Motion:**
  - keep the logo pop and flap and `.shimmer-text`;
  - add a "harpy is working" treatment (a shimmer on the card's status line plus the lively logo), which was borrowed from Night studio;
  - every animation respects `prefers-reduced-motion`.
- **Fix the existing problems:**
  - Hard-coded colors move to tokens:
    - the emerald, amber, sky, rose, violet and blue chips,
    - `bg-white`, `text-white` and `bg-black/50`,
    - the hex values in the OAuth callback page, the apple icon, the OG image and `icon.svg` (images may keep literal hex where Satori needs it, but values come from a shared constant).
  - The silver wordmark gradient gets a light-mode variant. It's currently low-contrast on the light background.
  - The stale comment about "cube faces" is fixed.
  - Check that the `font-sans` and `font-mono` utilities really resolve to Geist. next/font registers hashed family names, which is UNVERIFIED.

### 7.2 Components

- **shadcn primitives to add:**
  - `card`, `tabs`, `table`, `popover`, `calendar`, `sheet`, `sidebar`, `switch`, `avatar`, `skeleton`, `sonner`, `scroll-area`, `alert-dialog`, `label`, `toggle-group`
  - and `kbd`, if the registry has it; otherwise build it.
- **Hand-rolled components to replace:**
  - the toggle in `integrations-menu.tsx` becomes Switch;
  - `ErrorToast` becomes Sonner;
  - the profile status pill becomes Badge;
  - the duplicate two-step confirm buttons become AlertDialog;
  - the profile `Panel`/`Empty` become Card and EmptyState;
  - the two avatar implementations become Avatar.
- **New domain components in `components/harpy/`**, reused on every page:
  - `StatusChip`: grey chip with a colored glyph (dashed circle for draft, half-filled for needs review, clock for scheduled, check for posted, alert for failed). The glyph idea comes from Night studio.
  - `PlatformChip` / `PlatformIcon`: X, LinkedIn, Threads, WhatsApp, Slack. Rename the brand `XIcon` in `components/icons.tsx` to `XBrandIcon`, because it collides with lucide's close icon. Add WhatsApp and Slack icons.
  - `DraftCard`: platform chip, status chip, text, image, character count, scheduled time, the Approve / Edit / Skip actions with kbd hints, and a working state.
  - `IdeaBlock`: idea text, source tag ("via WhatsApp · 2 min ago"), and the drafts under it.
  - `PageHeader`, `EmptyState`, `KbdHint`, `WorkingIndicator`, `ChannelStatusPill`, `TimelineItem`, `MetricTile`.
- **Layout:**
  - One app shell built on the shadcn Sidebar with the nav: Studio, Calendar, Inbox (count badge), Brief, Brand voice, Channels, Chat, Settings.
  - Channel status pills ("WhatsApp connected") at the bottom of the sidebar.
  - `/profile` is folded into Channels and Settings, so every page shares the shell.
- **Living reference:** a `/design` page, visible only to signed-in users, that shows every token, primitive and domain component in both modes. Builder's call (made in this doc).
- **Copy rules:**
  - harpy is called "harpy" in the UI. The current "Ask eve anything" and "eve is responding" become harpy.
  - "eve" stays lowercase wherever the framework is named.
  - UI copy is in sentence case with straight quotes.
- **Theme:** add a user setting for system, light or dark, and merge the duplicate inline theme script and `ThemeProvider`. Builder's call (made in this doc).

The Night studio mockup used for reference is at `.superpowers/brainstorm/151-1792656564/content/visual-style.html`, the first of the three directions. Use it for **structure and interaction only** (layout, glyph statuses, keyboard hints, working state). Its colors and lime accent are not part of the design.

---

## 8. Detailed design

### 8.1 Foundation: eve 0.8.3 to 0.82.0

The research found that the agent-side APIs mostly carry over. The web client transport is a hard break.

**Dependencies and config**
- Pin `eve` to `0.82.0` exactly (not `latest`).
- Set `ai` to `^7.0.137` and `@vercel/connect` to `^2.5.2`. The Connect manifest compiler is required at build time.
- For WhatsApp, add `chat`, `@chat-adapter/whatsapp` and `@chat-adapter/state-redis` (and `state-memory` for local dev), all pinned to the same version (4.43.0 at research time).
- Delete `patches/eve@0.8.3.patch` and the `pnpm.patchedDependencies` block. The patch is obsolete in 0.82.
- Remove `legacy-peer-deps` from `.npmrc`.
- Remove `experimentalServices` from `vercel.json`. Vercel no longer routes it, and `withEve()` generates the services.
- Rename the package from `eve-chat-template` to `harpy`.
- Fix the docs path in `AGENTS.md` and `.agents/skills/eve-chat-template-eve/SKILL.md`, and update that skill's description of the persistence design.
- Run `eve build` early. It validates model ids against the AI Gateway catalog and checks the Connect manifest.
- Local development needs `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN`, plus the Better Auth variables (missing locally today). Document this in `docs/setup-and-deploy.md`.

**Web chat rewrite** (`app/_components/agent-chat.tsx`, 2,404 lines)
- Replace the hand-built `ClientSession`, NDJSON reader, reconnect loop, merge/dedupe logic and synthetic Skip events with the documented hook:
  ```ts
  useEveAgent({ reducer: defaultMessageReducer(), initialSession, resume, initialEvents, onEvent, onSessionChange, onFinish })
  ```
- The new calls are `send(message, options)`, `respond(inputResponses)` and `cancel()`. `cancel()` replaces both Stop and "Skip sign-in".
- A turn is settled on `isCurrentTurnBoundaryEvent(event)` or on `turn.waiting` with `on: "input"`. `authorization.required` is no longer settled: the same turn resumes after the OAuth callback.
- Persist events keyed on `event.meta.id`: add an `eve_event_id` column with a unique index per chat.
- Persist `ClientSessionState`, which replaces the removed `SessionState`.
- Expect roughly 900 to 1,500 lines to be deleted.
- `components/chat/message.tsx`:
  - handle the new `file` and `authorization` parts;
  - replace the stale `connection_search` check with `eve__search` / `eve__tool`;
  - use `part.toolMetadata.eve.label` for tool labels.
- Existing chats can't be resumed under 0.82, because durable sessions don't survive the version jump. **Builder's call (made in this doc):**
  - mark them `legacy`;
  - render them read-only, best effort, with a note that they're from an older version;
  - don't try to export them through the 0.8.3 reducer first.

  This was a test app. If old chats matter to the owner, they can overrule this.

**Connections**
- Remove the placeholder `x`, `linkedin` and `threads` MCP connections. Real publishing replaces them (8.6).
- Keep Notion, Linear, Sentry and DeepWiki.
- Keep the dynamic MCP tools (`connect_mcp` and the rest).

**Agent config**
- **Builder's call (made in this doc):**
  - root model `anthropic/claude-sonnet-5.5`, `reasoning: "medium"`, chosen for WhatsApp latency and cost;
  - writer subagent `anthropic/claude-opus-5.5`, `reasoning: "high"`, for quality;
  - researcher `anthropic/claude-sonnet-5.5`;
  - triage a Haiku 5.5 id if the Gateway catalog has one (UNVERIFIED), otherwise Sonnet 5.5.
- Never set `reasoning: "none"` or `"minimal"` with Opus 5.5.
- Never set `temperature`, `top_p` or `top_k`. They return 400 on current Claude models.
- Set `limits.sessionUsage` to a cost cap, for example $5 per window. Builder's call. The default of 40M input tokens is far too high.

### 8.2 Identity, brands and channels

**Tables**
- `brand`:
  - `id`, `owner_user_id`, `name`, `timezone` (IANA), `brief_local_time` (default 07:30), `created_at`.
  - Phase 1 creates one brand automatically for the owner.
  - **Every new product table keys on `brand_id`.**
- `channel_identity`:
  - `id`, `user_id`, `brand_id`, `channel` (`whatsapp` | `slack`), `external_id` (WhatsApp `wa_id`, or Slack `team:user`), `phone`, `bsuid`, `linked_at`;
  - unique on (`channel`, `external_id`).

**Who can sign in** (builder's call, made in this doc)
- harpy is single-owner for now. Today any Vercel account can sign in.
- Phase 1 adds an allowlist, `HARPY_ALLOWED_EMAILS` (comma-separated; defaults to `HARPY_OWNER_EMAIL`). Better Auth rejects any other account in a `databaseHooks.user.create.before` hook or a session check, sending it to `/auth/error` with a new `not_allowed` code. The eve web auth (`betterAuthEveAuth`) applies the same check.
- Everyone on the allowlist sees the owner's brand and may approve.
- Brand access is a `brand_member(brand_id, user_id, role)` table from the start, with the owner as the only row, so adding people later doesn't mean a migration.
- Existing users and chats from the test deployment are kept. Users not on the list simply can't sign in any more.

**One principal everywhere**
- Every channel resolves its sender to the same eve principal shape:
  - `principalType: "user"`
  - `principalId: <Better Auth user.id>`
  - `subject: email`
  - attributes: `brandId`, `channel` and channel ids (string values only)
- This keeps `resolveDbUserId` working across channels.
- Update `lib/eve-auth.ts` to add `brandId`.

**Memory scoping**
- Memory is scoped by `brandId`, not `byPrincipal`.
- `byPrincipal` would split memory per channel, because WhatsApp, Slack and web have different authenticators.

**Linking WhatsApp**
- **Bootstrap:**
  - the env vars `HARPY_WHATSAPP_ALLOWED_NUMBERS` (wa_ids) and `HARPY_OWNER_EMAIL`;
  - the first message from an allowed number links it to the owner.
- **General flow:**
  - Channels shows a 6-digit code (Upstash, 10-minute TTL) and a `wa.me/<number>?text=LINK%20123456` link and QR code;
  - the owner sends `LINK 123456`, which links the number.
- Messages from unknown numbers get **no reply**. Service messages cost money, and silence avoids leaking anything.

**Slack**
- Map the Slack user to the owner with the same link-code flow in a DM.
- `slackChannel` must map identity in `onMessage`, `onAppMention`, `onDirectMessage` **and `onInputResponse`**. Without the last one, every Slack approval is rejected as coming from someone other than the requester.
- Turn on `uploadPolicy` for images if wanted. Left to the builder.

**Cross-channel approvals of eve prompts**
- Most approvals are app-level (8.5), so this rarely matters.
- Where an eve tool approval exists, give it a `response` policy that accepts the same `principalId` from any channel.

### 8.3 WhatsApp channel

Based on the eve registry item `channel/chat-sdk-whatsapp` and the adapter source. The research report has the full code shapes.

**`agent/channels/whatsapp.ts`**
- Use `chatSdkChannel` with `createWhatsAppAdapter()`. The webhook is at `/eve/v1/whatsapp`.
- Settings:
  - `concurrency: "concurrent"`
  - `streaming: false` (WhatsApp can't edit messages)
  - `turnPolicy: "steer"`
  - a deterministic `resolveInputAuth` that returns the same principal as the sender
- Chat SDK state: `createRedisState({ url: REDIS_URL ?? KV_URL })`. This is the TCP URL of the same Upstash database; the REST URL doesn't work with this adapter.
- Use `bot.onDirectMessage` for inbound messages and `bot.onAction` for harpy's own buttons (`harpy:<verb>:<id>`).
- Override `message.completed` so generated images go out as WhatsApp media, not literal markdown.

**`lib/whatsapp/*`**

| File | Job |
|---|---|
| `adapter.ts` | Creates the adapter with fallbacks so builds without credentials still load. Patches `editMessage`/`deleteMessage` to throw `NotImplementedError` (the adapter throws a plain `Error`, which breaks eve's authorization handler). |
| `identity.ts` | Maps sender to principal, the allowlist bootstrap, and link codes. |
| `inbound.ts` | Pre-transcribes voice notes with `transcribe()` from `ai` using `openai/whisper-1` through the Gateway (UNVERIFIED at runtime; falls back to the documented `transcribe_audio` tool). Drops location pseudo-files. Adds quoted-reply context. |
| `reply.ts` | Formatting for WhatsApp: no headings, tables or markdown links; bare URLs; one message per turn; images as media. |
| `cloud-api.ts` | Raw Graph sends: review cards (image header, body, footer, 3 buttons), templates, list messages. |
| `review.ts` | Button handling: approve, edit, skip, retry. |
| `window.ts` | Tracks the 24-hour window in Upstash REST: last inbound time per number, refreshed by every message and button tap. |
| `statuses.ts` | A POST route wrapper records delivery statuses (sent, delivered, read, failed), which the adapter ignores. A failed 131047 (window closed) re-sends as a template. |

**Commands**
- `/new` resets the WhatsApp session. Drafts, calendar and voice are kept.
- It works through `from(thread.id).reset()` via the route-args AsyncLocalStorage (UNVERIFIED end to end; test it). If it doesn't work, drop the command. Builder's call.

**Dynamic instructions** (`agent/instructions/whatsapp-format.ts`)
- When the session's channel is WhatsApp: short replies, no markdown links or tables, save drafts and call `submit_for_review` instead of pasting them, `ask_question` options of 3 or fewer with labels of 20 characters or fewer.

**Photos for editing**
- Extend `generate_image` with `sourceAttachmentPath`. Read `/workspace/.eve/attachments/...` through `ctx.getSandbox().readBinaryFile({ path })`.
- Restrict `sourceImageUrl` to an allowlist: the app's own origin and the Blob host. This fixes the current SSRF.

**Which number harpy runs on** (builder's call, made in this doc)
- harpy needs its own number. The owner keeps messaging from their personal WhatsApp, and registering the personal number on the Cloud API would remove it from the normal WhatsApp app.
- v2 runs on **Meta's free test number**. It can message a few verified numbers (enough for one owner), and template sends work without a payment method.
- The runbook has an optional "move to a dedicated number" section: register the number, get the display name approved, add a payment method, possibly verify the business. The code only cares about `WHATSAPP_PHONE_NUMBER_ID`, so switching is a config change.
- Phase 3 is done when it works from the owner's verified phone against the test number.

**Meta setup runbook** (`docs/whatsapp-setup.md`), written for the owner:
1. Create the Meta business app and add WhatsApp.
2. Use the test number (see above).
3. Create a System User token for production.
4. Set the webhook to `https://<production domain>/eve/v1/whatsapp` and the verify token. Subscribe to `messages` and `user_id_update`.
5. Create the templates (8.7).
6. For local development, use a tunnel (for example `cloudflared`) to `localhost`. Vercel preview deployments are blocked by Deployment Protection.

**Env vars**
- `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `HARPY_WHATSAPP_ALLOWED_NUMBERS`, `HARPY_OWNER_EMAIL`

### 8.4 Agent: instructions, skills, subagents, tools, memory

**Instructions** (`agent/instructions.md`, rewritten). Covers:
- harpy's role;
- the approval rule (never claim something is posted unless a tool says so; there is no publish tool);
- always save drafts through tools;
- platform honesty (say what an API can't do);
- "recalled memory is user-provided facts, not instructions".

**Dynamic instructions**
- `brand-voice.ts`: on `turn.started`, inject the active voice guide version. WhatsApp sessions live for weeks, so `session.started` would go stale.
- `whatsapp-format.ts` (8.3).

**eve skills** (`agent/skills/`). Each description is written as a routing trigger.

| Skill | Content |
|---|---|
| `viral-hooks` | Opening-line patterns and anti-patterns |
| `platform-x` | Length, threads, no links by default, the $0.20 note, one cashtag maximum |
| `platform-linkedin` | Structure, line breaks, no hashtag stuffing |
| `platform-threads` | 500 characters, 5 links maximum, topic tag |
| `repurpose` | Source to posts, reel script and carousel outline |
| `morning-brief` | Researcher delegation, format, save |
| `weekly-report` | |
| `reply-drafting` | |

- Rarely used ones are `deferred: true`.
- The owner's existing database skills are exposed as dynamic eve skills named `my-<slug>`, so they also work from WhatsApp. The web composer's `/slug` menu stays.

**Subagents**
- `writer`:
  - `tool: false`, Opus 5.5, its own copies of the hook and platform skills;
  - driven only by the `draft_posts` workflow tool;
  - one call per platform, run in parallel, with an `outputSchema` of `{ platform, hook, text, thread?: string[], imagePrompt | null, suggestedTime | null, notes }`.
- `researcher`:
  - Sonnet 5.5, `web_search` and `web_fetch`;
  - used by the brief and by repurposing for long sources.
- No designer subagent. Image generation stays a tool.

**Model-facing tools** (new). All of them write to the database and none of them publish.

| Tool | Purpose |
|---|---|
| `draft_posts` (workflow) | Idea plus sources to drafts for each requested platform, saved as `pending_review`. Then generates images for drafts with an `imagePrompt` and attaches them. |
| `revise_draft` | Apply an edit request to one draft, creating a new revision. |
| `submit_for_review` | On WhatsApp, send the review cards (replay-safe: one send per draft revision). On the web, a no-op that returns "visible in Studio". |
| `propose_schedule` | Set a draft's proposed time. Approval is still required. |
| `list_drafts`, `list_calendar`, `list_inbox`, `get_post_metrics` | Reads |
| `draft_reply` | Create a reply draft for an inbox item |
| `save_brief` | Used by the brief session |
| `fetch_source` | Article text through `web_fetch`. YouTube transcript is best effort; on failure, ask the owner to paste it. |
| `save_content_piece` | Reel script or carousel outline |
| `ask_question` | Opt-in eve tool, 3 options maximum |
| `no_reply` | For background turns with nothing to say |

The existing tools stay: `generate_image` (extended), the MCP tools and the skill tools.

**Brand voice memory** (`agent/memory/voice.ts`)
- A custom `defineMemoryProvider` backed by Postgres, scoped `[brandId]`.
- It recalls, with stable ids:
  - the stated preferences,
  - 3 to 4 exemplar posts relevant to the current input,
  - the latest brief, so WhatsApp follow-ups like "draft #2" work.
- Recall results are cached by `operationId`, because eve requires replays to be deterministic.
- Tool: `voice__note_preference`, for when the owner states a durable preference.
- Exemplar retrieval:
  - **Builder's call (made in this doc):** start with recency plus a simple keyword overlap.
  - Add pgvector embeddings only if quality needs it. Left to the builder.

**Default voice guide**
- Seeded with writing rules against AI tells: sentence case, no em dashes, straight quotes, no "delve", "testament" or "tapestry" vocabulary, no rule-of-three filler.
- My guess: these match the owner's existing `human` writing skill. The owner edits it in Brand voice.
- Onboarding then rewrites the guide from the owner's pasted or imported past posts.

### 8.5 Drafts and the approval state machine

**Tables** (all `timestamptz`; every row has `brand_id`)
- `idea`:
  - `id`, `brand_id`, `text`, `source_kind` (text | voice | photo | link | brief | repurpose), `source_channel` (whatsapp | web | slack | schedule), `source_ref` (URL or media id), `created_at`.
- `draft`:
  - `id`, `idea_id`, `brand_id`, `platform` (x | linkedin | threads), `status`, `revision`, `text`, `thread_parts jsonb` (X threads), `media_ids`, `scheduled_at`, `approved_at`, `approved_via` (whatsapp | web), `published_at`, `external_post_id`, `external_url`, `error`, timestamps.
- `draft_revision`:
  - every text change, with `kind` (generated | user_edit_request | manual_edit).
  - This is the voice-learning signal.
- `content_piece`:
  - reel scripts and carousel outlines (`kind`, `body jsonb`).
- `wa_message_map`:
  - wamid to draft id, for quote-replies and reactions.

**States**

`generating → pending_review → (approved → scheduled → publishing → published | failed) | skipped`

- Edit returns a draft to `pending_review` with `revision + 1`.
- Approve with no time means publish now: `scheduled_at = now`.

**Rules**
- Approve, Skip and Retry are pure functions in `lib/review.ts`, called from:
  - the WhatsApp `onAction` handler,
  - web server actions,
  - (later) Slack buttons.
- **No model turn, no eve approval prompt.**
- Edit on WhatsApp sets a pending-edit marker in Upstash (keyed by wa_id, 30-minute TTL). The next inbound message carries `context: ["This message is the requested change to draft <id> (<platform>)..."]`.
- Edit on the web opens an inline editor with two choices: rewrite manually (stored as `manual_edit`) or ask harpy (runs `revise_draft`).
- **Stale taps** (on an already-published or newer revision): reply "That draft changed. Here's the latest" and resend the current card.

### 8.6 Social accounts and publishing

**Table `social_account`**
- `id`, `brand_id`, `platform`, `provider` (`direct` for now; the column exists so a unified vendor can be added later), `external_user_id`, `handle`, `access_token_enc`, `refresh_token_enc`, `access_expires_at`, `refresh_expires_at`, `scopes`, `status` (active | needs_reauth | revoked), `last_error`.
- Tokens are encrypted with AES-256-GCM using `SOCIAL_TOKEN_ENCRYPTION_KEY`.
- **Builder's call (made in this doc):** also encrypt the existing plaintext `mcp_connection.token` and `oauth` in Phase 1.

**OAuth routes**
- `/api/social/[platform]/connect` and `/api/social/[platform]/callback`, started from the Channels page.
- X uses PKCE and exchanges the code immediately (codes expire in 30 seconds).

**`lib/social/` provider interface**
- `publish(draft)`, `uploadMedia`, `listMentions(since)`, `listReplies(postIds)`, `reply(item, text)`, `getMetrics(postIds)`, `refresh()`

| Provider | How it works |
|---|---|
| **X (direct)** | `POST /2/tweets`. Threads are chained with `reply.in_reply_to_tweet_id`. Images go through `/2/media/upload`, up to 4 per post. Scopes: `tweet.read tweet.write users.read media.write offline.access`. |
| **Threads (direct, tester mode)** | Container (`image_url` = public Blob URL), about 30 seconds, then `threads_publish`. Threads are reply containers. Scopes: `threads_basic, threads_content_publish, threads_manage_replies, threads_read_replies, threads_manage_mentions, threads_manage_insights`. Refresh the token weekly. |
| **LinkedIn (direct, personal profile; decided by the owner)** | <ul><li>Products: "Sign In with LinkedIn using OpenID Connect" (to get the person URN) plus "Share on LinkedIn" (`w_member_social`).</li><li>Publish with `POST /rest/posts`, headers `Linkedin-Version: <pinned YYYYMM>` and `X-Restli-Protocol-Version: 2.0.0`. Keep the version in one constant and bump it before retirement.</li><li>Images: `POST /rest/images?action=initializeUpload`, then upload the bytes to `uploadUrl`.</li><li>Posting only: `listMentions`, `listReplies` and `getMetrics` return "not supported", and the UI says so.</li><li>No refresh tokens, so a `token_refresh` job sends `harpy_reconnect_needed` around day 50 and marks the account `needs_reauth` at expiry.</li></ul> |

**Publishing is idempotent and at-least-once**
- `post_publication` table: `draft_id`, `platform`, `idempotency_key` (unique), `status` (sending | sent | ambiguous | failed), `provider_post_id`, `attempts`.
- Mark `sending` before the API call.
- On a timeout or other ambiguous failure, check the account's recent posts for a text match before retrying. Never mark an ambiguous publish as done.
- Retry policy: 3 attempts with backoff, then `failed` and a WhatsApp notification with Retry.

### 8.7 Jobs, schedules and notifications

**One job table, one dispatcher.** `scheduled_job` columns:
- `id`, `brand_id`, `kind`, `payload jsonb`, `next_run_at timestamptz`, `status`, `lease_until`, `lease_token`, `attempts`, `last_error`, `dedupe_key` (unique)
- `kind` is one of:
  - `publish_post`
  - `inbox_poll`
  - `metrics_sync`
  - `token_refresh`
  - `morning_brief`
  - `weekly_report`
  - `voice_refresh`
  - `outbox_flush`

`lib/jobs/runDueJobs()`:
1. Claims due rows atomically: `UPDATE ... WHERE id IN (SELECT ... FOR UPDATE SKIP LOCKED) RETURNING *`. This works on neon-http as a single statement.
2. Runs each job.
3. Completes it or releases it with a backoff.

Recurring jobs compute their next local run time from `brand.timezone`, so daylight saving time is handled in code, not cron. Duplicates are prevented by `dedupe_key`, for example `brief:<brandId>:<localDate>`.

**What triggers `runDueJobs()`:** Upstash QStash (Hobby plan, decided by the owner). This is the same vendor as the existing Redis, with a separate QStash token.
- **Tick route:** `POST /eve/v1/jobs/tick`, defined as a route on the `jobs` custom channel (below), so the handler can start eve sessions. It verifies the `Upstash-Signature` header with `@upstash/qstash` `Receiver` (`QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`) and rejects anything unsigned.
- **Heartbeat:** one QStash schedule (`*/5 * * * *`) calls the tick. That's 288 messages a day, inside QStash's free tier of about 1,000 messages a day (to check at setup; Upstash may count retries as messages). It handles inbox polling, outbox flushes, token refresh, recurring jobs and anything that's due.
- **Exact-time publishing:**
  - When a draft is approved with a time, the code inserts the `publish_post` job **and** publishes a QStash message with `notBefore = scheduled_at` that calls the tick with `{ jobId }`. The post goes out within about a minute of its time.
  - The 5-minute heartbeat is the safety net if that message is lost.
  - Rescheduling updates `next_run_at`. An early message is ignored if the job's time has moved, because the claim query checks `next_run_at <= now()`.
- **No eve `defineSchedule` files.** On Hobby, anything more frequent than daily fails the deploy, and one mechanism is simpler.
- **Setup:** the QStash schedule is created once by a script, `pnpm jobs:setup`, that calls the QStash API with the production URL. The script is idempotent and documented in the setup guide.
- **Local development:** a `pnpm jobs:tick` script posts to the local route with a dev bypass enabled only when `NODE_ENV !== "production"`.
- **Env vars:** `QSTASH_TOKEN`, `QSTASH_CURRENT_SIGNING_KEY`, `QSTASH_NEXT_SIGNING_KEY`.

**Background agent work** (brief, weekly report, voice refresh, inbox triage)
- Runs in eve sessions started from the tick route on the custom channel `agent/channels/jobs.ts`:
  - `defineChannel` with `routes: [POST("/eve/v1/jobs/tick", ...)]`;
  - a `receive()` that calls `from("jobs:<key>").send(message, { auth })`.

  The research verified the `receive` signature from the types, but nobody has run it yet. If the route args don't expose `from`, use `to(jobs, { key })` from the same handler.
- It runs **as the owner's principal**, so brand memory and user-scoped tools work, and never inside the WhatsApp session. A message dropped into the WhatsApp session would cancel a pending eve approval and fail outside the 24-hour window.
- The job saves its output to Postgres, then enqueues a notification.
- Long jobs must not hold the tick request open past 300 seconds. The tick claims jobs and starts sessions, and the sessions run durably in eve.

**Outbox** (`notification` table)
- Columns: `id`, `brand_id`, `kind`, `dedupe_key` (unique), `service_payload`, `template_payload`, `status`, `provider_message_id`, `attempts`.
- The `outbox_flush` job decides per message:
  - window open: a service message, interactive with harpy buttons;
  - window closed: a utility template with quick-reply payloads.
- Delivery statuses update the row. A failed 131047 re-sends as a template.

**Templates** (Utility, `en`), created in WhatsApp Manager by the owner following the runbook. The wording is about the owner's own account activity, so Meta keeps them as Utility rather than Marketing.

| Template | Purpose | Quick replies |
|---|---|---|
| `harpy_morning_brief` | Brief is ready | Show brief / Not today |
| `harpy_drafts_ready` | Drafts are ready for review | Review |
| `harpy_post_published` | Post went live | View post |
| `harpy_post_failed` | Publishing failed | Retry / Open |
| `harpy_new_activity` | New mentions and replies | Review now / Later |
| `harpy_weekly_report` | Weekly summary is ready | Show summary |
| `harpy_reconnect_needed` | A token is expiring or was revoked | Open Channels |

**Notification budget**
- Batch inbox notifications. Builder's call (made in this doc): at most 3 per day, not between 22:00 and 07:00 local time.
- Published confirmations are merged when several posts go out in the same 10 minutes.

### 8.8 Media

- Move images from base64 in Postgres to a **public Vercel Blob store**. A `media_asset` table holds `id`, `brand_id`, `blob_url`, `media_type`, `width`, `height`, `source` (generated | uploaded | whatsapp), `prompt`, `created_at`.
- Public URLs are required:
  - Threads fetches images by URL;
  - WhatsApp card headers use `image.link`;
  - it avoids Deployment Protection problems.
- `/api/images/[id]` keeps serving old `generated_image` rows. New rows redirect to Blob.
- Image size checks before publishing:
  - X: 5 MB maximum
  - Threads: JPEG or PNG, 8 MB maximum, 320 to 1440 px wide
  - LinkedIn: JPG, GIF or PNG

### 8.9 Inbox and insights

- **Tables:**
  - `inbox_item`: `id`, `brand_id`, `platform`, `external_id` (unique per platform), `kind` (mention | reply | quote), `author`, `text`, `url`, `in_reply_to_post_id`, `triage` (needs_reply | fyi | ignore), `state` (open | replied | done), `reply_draft_id`, `created_at`
  - `post_metric_snapshot`: `draft_id`, `platform`, `captured_at`, `metrics jsonb`
- **`inbox_poll`** (every 15 minutes):
  - X: `GET /2/users/:id/mentions?since_id` (owned reads).
  - Threads: `/{user-id}/mentions`, plus replies on posts from the last 7 days.
- LinkedIn has no inbox: the API doesn't allow it for personal profiles. The Inbox page shows a one-line note with an "Open LinkedIn notifications" link.
- **Triage:** a cheap-model background session, in batches, started **only when the poll found new items**. Polling itself is plain code with no eve session, to keep Workflow events low.
- **Reply drafts:** the same review flow. X replies only for summoned posts; otherwise mark "reply manually" with a link.
- **`metrics_sync`** (daily): snapshots for posts from the last 30 days.
- **`weekly_report`:** reads snapshots and voice edits, writes a report row, notifies the owner.

### 8.10 Cost and abuse guards

- **Session usage cap:** `limits.sessionUsage`, about $5 per window. Builder's call.
- **Vercel Hobby usage**, so features don't pause for 30 days:
  - no agent sessions for routine checks;
  - background agent work only when there's something new;
  - the brief and the weekly report once each per period;
  - Settings shows rough monthly counts of agent sessions and jobs, so the owner sees a limit coming.
  
  If Workflow events still run high, upgrading to Pro removes the limit. With Pro, a per-minute eve schedule can also replace the QStash heartbeat, but that's optional.
- **Rate limits:**
  - image generation per brand per day,
  - drafting runs per hour,
  - existing web send limits,
  - also applied to WhatsApp inbound (per wa_id).
- **WhatsApp:** one outbound message per turn, cards instead of separate image and text messages, and the notification budget (8.7).
- **X:** no links by default. If a post includes a link, the card footer shows "includes a link · $0.20".
- **Sandbox:** inbound photos cost a sandbox session. If this shows up in the bill, move photo handling to Blob plus a URL attachment. Left to the builder.

### 8.11 Security and cleanup (Phase 1)

**Security fixes**
- Escape HTML in `app/api/mcp/oauth/callback/route.ts` (reflected XSS through `?error=`).
- Add an allowlist for `generate_image` source URLs (SSRF).
- Encrypt tokens at rest (8.6).
- Verify WhatsApp webhook signatures (the adapter does HMAC).
- Authenticate the job tick route.
- Never put `brandId` or a tenant in tool inputs. It comes only from verified `auth.attributes`.

**Delete**
- `agent-chat-skeleton.tsx`
- `template-footer-links.tsx`
- `app/api/bootstrap/route.ts`
- `GitHubIcon`
- the RHP logo SVG
- `updateChatTitle`
- unused shadcn primitives that the new design doesn't use

**Deduplicate**
- the three origin resolvers (into one `getAppOrigin`)
- the three platform registries (into one `lib/platforms.ts`)
- the setup "disabled reason" ladder
- `hasOpenTurn`

**Other cleanup**
- Fix the drizzle upserts that read and then write: use `onConflictDoUpdate`.
- Consider the Neon serverless Pool for real transactions where several writes must succeed or fail together. Left to the builder.
- Update `README.md`, `docs/how-the-chatbot-works.md`, `docs/setup-and-deploy.md` and `.env.example`.

### 8.12 Evals and verification

**Evals** (`evals/`, eve evals)
- Stub every side-effecting tool.
- Deterministic gates:
  - X length,
  - Threads 500 characters,
  - banned phrases,
  - no em dashes if the voice guide says so,
  - no links on X unless asked,
  - `viral-hooks` skill loaded.
- One batched judge per case for hook strength and voice match against a fixture guide.
- About 15 ideas in `evals/data/ideas.yaml`.

**Manual verification for each phase:** the "done when" column in section 6. For WhatsApp and publishing, use the real test number and real accounts. Publishing tests use a dedicated test post that is deleted afterwards where the API allows.

**Commands:** `pnpm typecheck`, `pnpm build` and `pnpm eve:build` stay green at the end of every phase.

---

## 9. What each platform will and won't do in v2

| | X | Threads | LinkedIn (direct, personal profile) |
|---|---|---|---|
| Post text and image | yes | yes | yes |
| Thread or multi-post | yes (chain) | yes (reply chain) | no (single post) |
| Read mentions and replies | yes (polling, $0.001 each) | yes (polling) | **no** |
| Reply from harpy | summoned only | yes | no |
| Metrics | own posts, last 30 days | yes | **no** (weekly summary lists LinkedIn posts without stats) |
| Token upkeep | auto refresh | weekly refresh | **re-login every 60 days** (reminder around day 50) |
| Cost | about $3 to $15 a month | free | free |

---

## 10. Owner decisions recorded

- Use case: personal content studio and social media operator, with every item in section 2 goals (confirmed playback).
- WhatsApp is the main channel, and web and Slack stay. Use the official Meta API only, with the 24-hour window and templates handled as described (confirmed playback).
- Upgrade eve to the current version as a careful first step (confirmed playback).
- Keep the silver design system, formalize it, and borrow Night studio's structure without its colors (confirmed playback).
- Single owner first, with multi-brand possible later (confirmed playback).
- Vercel plan is Hobby. Scheduling therefore runs on Upstash QStash, with no eve cron schedules (answered after the review).
- LinkedIn posts directly to the owner's personal profile, with no third-party service. LinkedIn is posting only (answered after the review).

## 11. Builder's calls made in this doc (for the owner to check)

1. Root model Sonnet 5.5; writer Opus 5.5 (high reasoning); researcher Sonnet 5.5; triage Haiku 5.5 if available.
2. The model never gets a publish tool. Approve, Skip and Retry are button and click handlers only.
3. Old 0.8.3 chats become read-only legacy chats and aren't migrated.
4. Images move to a public Vercel Blob store.
5. A `brand` table from day one; memory is scoped per brand.
6. Existing MCP tokens are encrypted, along with new social tokens.
7. Session usage cap of about $5 per window; notification budget of 3 a day with quiet hours from 22:00 to 07:00.
8. A `/design` reference page and a theme setting (system, light, dark).
9. Exemplar retrieval starts with recency and keywords, with no vector database.
10. The default voice guide is seeded from the owner's anti-AI writing rules (a guess: their `human` skill).
11. `/new` on WhatsApp is dropped if the reset mechanism doesn't hold up in testing.
12. Carousels are outlines with a cover image (no rendered PDF documents in v2). YouTube transcripts are best effort.
13. Web sign-in is limited to an email allowlist (the owner by default). Brand access goes through a `brand_member` table.
14. WhatsApp runs on Meta's free test number, and moving to a dedicated number later is a config change.

## 12. Open decisions for the owner

None. The two open questions (Vercel plan, LinkedIn route) were answered and are recorded in section 10.

## 13. Left to the builder

- Exact color values for status and platform glyphs (within the rules in 7.1).
- Drag-to-reschedule in the calendar.
- pgvector for exemplars.
- Slack image uploads.
- Neon Pool for transactions.
- Moving photo handling off the sandbox.
- Internal module layout under `lib/` beyond what's named here.
- Copy wording, within the copy rules.
