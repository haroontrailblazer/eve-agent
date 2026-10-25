# harpy Phase 2 (Studio and drafting) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An idea typed in Studio, or asked for in chat, becomes X, LinkedIn and Threads drafts in the owner's voice, with images where they help. The owner approves, edits or skips each draft on the web. Edits are stored for learning, Brand voice v1 lets the owner teach harpy how they write, and evals check length, banned phrases and hook quality.

**Architecture:**
- **The model writes; plain code reviews.** The model writes drafts and revisions. Approve, Skip, Restore and manual edits are server actions over `lib/review.ts` and never start a model turn. There is still no publish tool (publishing is Phase 4).
- **One drafting path.** Every route into drafting ends at the `draft_posts` workflow tool: Studio, web chat, and later WhatsApp. The tool asks the `writer` subagent (Opus 5.5) for one target per call, in parallel, with a structured `outputSchema`. It lints each result and asks the writer once to fix hard errors. Then it saves the drafts and generates images.
- **Studio starts runs from the browser.** It creates the `idea` row with a server action. It then starts a fresh eve session with `new Client({ host }).sessions.create({ message })` from `eve/client`, without streaming. The page polls `GET /api/studio` until the drafts land. No chat row is created.
- **Testable core.** Orchestration lives in `lib/drafts/orchestrate.ts` as plain async functions that take their side effects as injected dependencies. The workflow tool wires those dependencies to `"use step"` functions and `ctx.agent("writer")`. vitest only covers `lib/**` and `components/**`, so all logic lives there and the files under `agent/` stay thin.
- **Brand voice.** It reaches the model three ways:
  - every root turn, a dynamic system instruction carries the active guide;
  - a Postgres-backed memory slot recalls preferences and a few example posts, and offers `voice__note_preference`;
  - the writer gets the guide, preferences and the best-matching examples inside each brief.

**Tech Stack:** eve 0.82.0 (workflow tools, declared subagents, custom memory provider, dynamic instructions, `defineSkill`, eve evals), Next.js 16.2.6, React 19.2.6, Drizzle 0.45.1 on Neon (neon-http), Upstash Redis, Vercel Blob, zod 4, vitest 5.0.5.

**Spec:** `docs/superpowers/specs/2026-10-22-harpy-content-studio-design.md`. Read sections 2, 3.1, 3.5, 3.6, 6 (Phase 2 row), 7.2, 8.4, 8.5, 8.8, 8.10 and 8.12. This plan implements Phase 2 on top of the merged Phase 1 (`main` at `c2f42ac`).

**eve docs to read before the matching task** (all under `node_modules/eve/docs/`):
- `tools/overview.mdx` and `tools/workflows.mdx` (Tasks 6 and 7);
- `subagents/index.mdx` (Task 5);
- `memory/custom-provider.md`, `memory/overview.mdx`, `patterns/multi-tenant-memory.md` and `guides/dynamic-capabilities.md` (Task 8);
- `skills.mdx` (Task 2);
- `evals/*.mdx` and the "Tool replacement permission" section of `guides/auth-and-route-protection.md` (Task 12).

## Global Constraints

- **eve docs.** Read the relevant guide in `node_modules/eve/docs/` before writing code that touches eve.
- **Lowercase names.** Write "eve" and "harpy" in lowercase in UI copy, docs, prompts and comments.
- **UI copy.** Sentence case, straight quotes, no em dashes or en dashes.
- **Leave versions as they are.** eve 0.82.0, next 16.2.6, react 19.2.6, drizzle-orm 0.45.1, drizzle-kit 0.31.9, zod 4.4.3, vitest 5.0.5. Add no new runtime dependency.
- **Models.**
  - Root: `anthropic/claude-sonnet-5.5`, reasoning `"medium"` (unchanged).
  - Writer: `anthropic/claude-opus-5.5`, reasoning `"high"`.
  - Never set `temperature`, `top_p` or `top_k`. Never use reasoning `"none"` or `"minimal"` with Opus.
- **No publish tool.** Approve, Skip, Restore and manual edits are deterministic server code. No tool may approve, schedule for publishing or publish.
- **Brand ids.** Tools never accept `brandId` or any tenant id as input. Tools get the brand only from `resolveBrandContext(ctx)` (`lib/mcp-context.ts`). Server actions get it only from `getBrandIdForUser(viewer)`. Every query on brand data filters on `brand_id`.
- **Tables.**
  - Every new table has `brand_id` (FK `brand.id`, cascade) and uses `timestamp(name, { withTimezone: true })`.
  - Enums are `text` columns with `.$type<...>()`, not pg enums.
  - Ids are `randomUUID()` from `node:crypto`.
  - New tables are added to `REQUIRED_TABLES` in `lib/db/client.ts`. Its test fails otherwise.
- **Atomic writes.** neon-http has no transactions. A write that changes a `draft` row and inserts its `draft_revision` row must be one SQL statement: a CTE through `db.execute(sql\`...\`)`, which returns `{ rows }` with snake_case keys.
- **Vercel Hobby.**
  - Add no `defineSchedule`.
  - Steps must finish well under 300 seconds.
  - The writer and other children run in their own sessions, so only their awaits sit in the workflow body.
- **Workflow bodies.**
  - A body is deterministic.
  - Clocks, randomness, `process.env`, DB and network calls belong in `"use step"` functions.
  - `ctx.agent` and `ctx.ask` are used only in the body.
  - `ctx` may be passed directly as the first argument to a step.
- **Limits** (spec 8.10). These are new constants, read with the existing `enforceRateLimit`:

  | Constant | Value | Prefix | Keyed on |
  |---|---|---|---|
  | `DRAFT_RUNS_PER_HOUR` | 20 | `"draft:run"` | brandId |
  | `REVISIONS_PER_HOUR` | 40 | `"draft:revise"` | brandId |

  `IMAGE_GENERATIONS_PER_DAY` (50, `"image:generate"`) is unchanged and also covers draft images.
- **Copy for X links.** When an X draft contains a link, its meta line includes `includes a link · $0.20` (spec 8.10).
- **Tests.** They live next to the module as `*.test.ts` under `lib/` or `components/`, and import from `"vitest"` explicitly.
  - DB modules mock `@/lib/db/client`, following `lib/media/assets.test.ts`, or use a recording fake, following `lib/db/mcp.test.ts`.
  - Raw SQL is asserted by rendering it with `new PgDialect().sqlToQuery(...)` from `drizzle-orm/pg-core`.
  - Components are tested with `renderToStaticMarkup`.
- **Checks.** `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm eve:build` pass at the end of every task that touches their inputs, and all four pass at the end of the plan.
- **Commits.** Work on branch `harpy-studio`, created from `main`, with at least one commit per task. End every commit message with the Co-Authored-By line of the model that wrote it, for example:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```

## Review Focus

1. **The same review action twice, or from two places.** This covers a double-clicked Approve, Skip in one tab after Approve in another, and saving an edit made on an old revision. Only the first action applies. Later ones get "That draft changed. Showing the latest." along with the current draft. Two revisions never share a number. Tests in Task 4:
   - `approveDraft` returns `invalid_state` on an approved draft;
   - it returns `stale` on a revision mismatch;
   - its rendered SQL carries `"revision" =` and `"status" in` guards;
   - `saveManualEdit` returns `stale` for an old revision.
2. **A drafting run that repeats.** This covers a workflow replay, "Try again" while the first run is still going, and chat asking twice. There is at most one draft per idea and platform, and at most one piece per idea and kind. A repeat without `redraft` reports "already drafted". Tests:
   - Task 4: `saveGeneratedDraft` in `create` mode renders `on conflict ("idea_id", "platform") do nothing` and returns `created: false` for an existing row;
   - Task 6: the orchestrator skips existing targets.
3. **Writer output that's wrong.** Examples: still over the limit after the repair round, empty posts, a schema mismatch, a `suggestedTime` in the past, unparseable or months ahead, LinkedIn returned as several posts, or a 50,000-character pasted source. The result is a saved draft with visible warnings or a reported failure for that target. It never crashes the run, and bad times are dropped. Tests:
   - Task 5: `normalizeSuggestedTime`, `postsForPlatform`, and source truncation in `buildWriterMessage`;
   - Task 6: orchestrator cases for repair, failure and empty output.
4. **Shortcuts while typing.** J, K, A, E, S or ? pressed inside the idea composer, the draft editor or any input, or together with Ctrl, Cmd or Alt, does nothing. The test is in Task 9: `keyToAction` returns `null` for those targets and modifiers.
5. **Another brand's ids.** A draft or idea id from another brand in an action or a tool input reads as not found, and nothing changes. Tests in Task 4: the rendered SQL of every write in `lib/review.ts` and `lib/drafts/store.ts` contains a `"brand_id" =` predicate.

## Calls this plan makes, and what it leaves for later

**Choices where this plan departs from, or narrows, the spec:**
- **No `generating` draft status.** Draft rows are created once the writer returns. "harpy is drafting" comes from `idea.draft_requested_at`, and "harpy is refining" comes from `draft.revision_requested_at`. Both go stale after 10 minutes, which surfaces "Try again" instead of a stuck card.
- **Approve only marks a draft approved.** Publishing, and the `scheduled` and `publishing` states, arrive in Phase 4. Drafts approved now get no publish job. Phase 4 decides what to do with them.
- **The writer's guidance is always on.** It gets the hook and platform guidance in its instructions and brief, not as skills it would have to load. The root agent still has the five skills for chat. The eval gate "viral-hooks skill loaded" becomes a judge score for hook quality.
- **`fetch_source` is replaced by eve's built-in `web_fetch`**, which is SSRF-safe. The model passes the article text as `sources`. **`save_content_piece` is folded into `draft_posts`** (`pieces`).
- **The evals run the real tools** as the owner, against a non-production database, behind a local-only flag. They use no stubs.
- **Em dashes are always a lint error**, whatever the guide says. That matches the owner's default rules.
- **A `studio` idea source** separates ideas typed in Studio from ideas asked for in chat.
- **Settings gets a time zone setting**, because suggested times and the meta line need it.

**Left for later stages:**
- Phase 3: `submit_for_review`, `wa_message_map`, and the `my-<slug>` dynamic skills.
- Phase 5: recalling the latest brief, and voice proposals learned from edits.
- Phase 4: the image size checks that run before publishing.

## Prerequisites (owner actions; needed only for manual checks and evals)

Unit tests, `pnpm typecheck`, `pnpm build` and `pnpm eve:build` need none of these.

- **P1. Images.** In the Vercel dashboard, create a **public** Blob store and connect it to the project. Then run `vercel env pull .env.local --yes`. Without it, drafts still save; they just come without images.
- **P2. Local model access.** `AI_GATEWAY_API_KEY` in `.env.local`, or `VERCEL_OIDC_TOKEN` from `vercel env pull`.
- **P3. Migration.** Migration 0010 only adds tables, so it can run before the merge. The owner runs `! pnpm db:migrate:production`, because auto mode blocks the agent from production database writes. Ask the owner before any deploy or merge.

---

### Task 1: Draft and voice data model

**Files:**
- Modify: `lib/db/schema.ts` (seven new tables and their exported types)
- Create: `lib/db/migrations/0010_studio_drafts.sql`, via `pnpm db:generate --name studio_drafts`, plus the generated `meta/` snapshot and journal
- Modify: `lib/db/client.ts` (add the seven tables to `REQUIRED_TABLES`)
- Create: `lib/drafts/types.ts`, `lib/drafts/state.ts`
- Test: `lib/drafts/state.test.ts`, `lib/drafts/types.test.ts`

**Interfaces:**
- Produces in `lib/drafts/types.ts`:
  ```ts
  export const SOCIAL_PLATFORM_KEYS = ["x", "linkedin", "threads"] as const;
  export type SocialPlatform = (typeof SOCIAL_PLATFORM_KEYS)[number];
  export const PIECE_KINDS = ["reel_script", "carousel_outline"] as const;
  export type PieceKind = (typeof PIECE_KINDS)[number];
  export type DraftTarget = { readonly kind: "post"; readonly platform: SocialPlatform } | { readonly kind: "piece"; readonly piece: PieceKind };
  export const DRAFT_STATES = ["pending_review", "approved", "scheduled", "publishing", "published", "failed", "skipped"] as const;
  export type DraftState = (typeof DRAFT_STATES)[number];
  export type IdeaSourceKind = "text" | "voice" | "photo" | "link" | "brief" | "repurpose";
  export type IdeaSourceChannel = "studio" | "web" | "whatsapp" | "slack" | "schedule" | "eval"; // "studio" = typed in Studio; "web" = asked for in web chat
  export type IdeaRequest = { readonly platforms: readonly SocialPlatform[]; readonly pieces: readonly PieceKind[] };
  export type RevisionKind = "generated" | "user_edit_request" | "manual_edit";
  export type ApprovedVia = "web" | "whatsapp";
  export function isSocialPlatform(value: unknown): value is SocialPlatform;
  export function isPieceKind(value: unknown): value is PieceKind;
  export function targetKey(target: DraftTarget): string; // "post:x", "piece:reel_script"
  ```
- Produces in `lib/drafts/state.ts`:
  ```ts
  export type ReviewAction = "approve" | "skip" | "restore" | "edit";
  export const ACTION_FROM_STATES: Readonly<Record<ReviewAction, readonly DraftState[]>>;
  export function canApply(action: ReviewAction, state: DraftState): boolean;
  export function stateAfter(action: ReviewAction): DraftState;
  export function toDisplayStatus(state: DraftState): DraftStatus; // DraftStatus from lib/draft-status.ts (Task 10 adds "approved" and "skipped")
  ```
- Produces tables, exported as `Idea`, `Draft`, `DraftRevision`, `ContentPiece`, `VoiceGuide` (row type name `VoiceGuideRow`, to avoid clashing with Task 3's record type), `VoiceExampleRow` and `VoicePreferenceRow` via `$inferSelect`. `$type<>` annotations come from `lib/drafts/types.ts`.

  | Table | Columns | Indexes |
  |---|---|---|
  | `idea` | `id` text PK; `brand_id` NN FK cascade; `created_by_user_id` FK user set null; `text` NN; `source_kind` NN; `source_channel` NN; `source_ref` null; `requested` jsonb NN `$type<IdeaRequest>()`; `draft_requested_at` tstz null; `created_at` tstz NN default now | `idx_idea_brand_created (brand_id, created_at)` |
  | `draft` | `id` PK; `idea_id` NN FK idea cascade; `brand_id` NN FK cascade; `platform` NN `$type<SocialPlatform>`; `status` NN default `'pending_review'` `$type<DraftState>`; `revision` int NN default 1; `hook` NN default `''`; `text` NN; `thread_parts` jsonb `$type<string[] \| null>`; `media_ids` jsonb NN default `'[]'` `$type<string[]>`; `image_prompt` null; `scheduled_at`, `approved_at` tstz null; `approved_via` null `$type<ApprovedVia>`; `published_at` tstz null; `external_post_id`, `external_url`, `error` null; `notes` NN default `''`; `revision_requested_at` tstz null; `created_at`, `updated_at` tstz NN default now | unique `idx_draft_idea_platform (idea_id, platform)`; `idx_draft_brand_status (brand_id, status, scheduled_at)` |
  | `draft_revision` | `id` PK; `draft_id` NN FK draft cascade; `brand_id` NN FK cascade; `revision` int NN; `kind` NN `$type<RevisionKind>`; `text` NN; `thread_parts` jsonb `$type<string[] \| null>`; `instruction` null; `created_by_user_id` FK user set null; `created_at` tstz NN default now | unique `idx_draft_revision_draft_revision (draft_id, revision)` |
  | `content_piece` | `id` PK; `idea_id` NN FK idea cascade; `brand_id` NN FK cascade; `kind` NN `$type<PieceKind>`; `title` NN; `body` jsonb NN; `media_ids` jsonb NN default `'[]'`; `created_at`, `updated_at` tstz NN default now | unique `idx_content_piece_idea_kind (idea_id, kind)` |
  | `voice_guide` | `id` PK; `brand_id` NN FK cascade; `version` int NN; `body` NN; `source` NN `$type<"default" \| "manual" \| "harpy" \| "restore">`; `note` NN default `''`; `created_by_user_id` FK user set null; `created_at` tstz NN default now | unique `idx_voice_guide_brand_version (brand_id, version)` |
  | `voice_example` | `id` PK; `brand_id` NN FK cascade; `platform` null `$type<SocialPlatform>`; `text` NN; `source` NN `$type<"pasted" \| "published">`; `created_at` tstz NN default now | `idx_voice_example_brand_created (brand_id, created_at)` |
  | `voice_preference` | `id` PK; `brand_id` NN FK cascade; `text` NN; `source` NN `$type<"owner" \| "chat">`; `created_at` tstz NN default now | `idx_voice_preference_brand (brand_id, created_at)` |

- [ ] **Step 1: Write `lib/drafts/state.test.ts`.**

```ts
import { describe, expect, it } from "vitest";
import { canApply, stateAfter, toDisplayStatus } from "@/lib/drafts/state";

describe("canApply", () => {
  it.each([
    ["approve", "pending_review", true], ["approve", "approved", false], ["approve", "skipped", false],
    ["skip", "pending_review", true], ["skip", "approved", true], ["skip", "published", false],
    ["restore", "skipped", true], ["restore", "pending_review", false],
    ["edit", "pending_review", true], ["edit", "approved", true], ["edit", "publishing", false], ["edit", "skipped", false],
  ] as const)("%s from %s is %s", (action, state, expected) => expect(canApply(action, state)).toBe(expected));
});

describe("stateAfter", () => {
  it("maps each action to its target state", () => {
    expect([stateAfter("approve"), stateAfter("skip"), stateAfter("restore"), stateAfter("edit")])
      .toEqual(["approved", "skipped", "pending_review", "pending_review"]);
  });
});

describe("toDisplayStatus", () => {
  it.each([
    ["pending_review", "needs_review"], ["approved", "approved"], ["scheduled", "scheduled"], ["publishing", "scheduled"],
    ["published", "posted"], ["failed", "failed"], ["skipped", "skipped"],
  ] as const)("%s shows as %s", (state, display) => expect(toDisplayStatus(state)).toBe(display));
});
```

  `toDisplayStatus` returns `"approved"` and `"skipped"`, which `DraftStatus` gains in Task 10. Until then, type the function's return as `DraftStatus | "approved" | "skipped"`. Task 10 then narrows it back to `DraftStatus`.

- [ ] **Step 2: Write `lib/drafts/types.test.ts`.** Cover:
  - `isSocialPlatform("x")` is true and `isSocialPlatform("whatsapp")` is false;
  - `isPieceKind("carousel_outline")` is true;
  - `targetKey({ kind: "piece", piece: "reel_script" })` is `"piece:reel_script"`.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/drafts`. Expected: FAIL, because the modules are missing.
- [ ] **Step 4: Implement `lib/drafts/types.ts` and `lib/drafts/state.ts`** as listed under Interfaces.
- [ ] **Step 5: Add the seven tables to `lib/db/schema.ts`** under a `// Studio and drafting (Phase 2)` comment, exactly as in the table above, and add them to `REQUIRED_TABLES`.
- [ ] **Step 6: Generate the migration.** Run `pnpm db:generate --name studio_drafts`.
  - Expected: `lib/db/migrations/0010_studio_drafts.sql` contains seven `CREATE TABLE` statements and only `CREATE INDEX` / `ADD CONSTRAINT` otherwise, with no `ALTER` or `DROP` of existing tables.
- [ ] **Step 7: Run the tests.** Run `pnpm test`. Expected: all pass, including `lib/db/client.test.ts`.
- [ ] **Step 8: Run `pnpm typecheck`.** Expected: no errors.
- [ ] **Step 9: Commit.**

```bash
git add lib/db/schema.ts lib/db/client.ts lib/db/migrations lib/drafts
git commit -m "feat(drafts): idea, draft, revision, content piece and voice tables with the review state machine"
```

---

### Task 2: Content guides, draft lint and root skills

**Files:**
- Create in `lib/content-guides/`:
  - `anti-ai.ts`
  - `hooks.ts`
  - `platforms.ts`
  - `repurpose.ts`
  - `voice-default.ts`
- Create: `lib/drafts/lint.ts`
- Test: `lib/drafts/lint.test.ts`, `lib/content-guides/content-guides.test.ts`
- Create in `agent/skills/`:
  - `viral-hooks.ts`
  - `platform-x.ts`
  - `platform-linkedin.ts`
  - `platform-threads.ts`
  - `repurpose.ts`

**Interfaces:**
- Produces:
  ```ts
  // lib/content-guides/anti-ai.ts
  export const BANNED_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[];
  export const ANTI_AI_RULES: string; // markdown bullets
  // lib/content-guides/hooks.ts
  export const VIRAL_HOOKS_GUIDE: string;
  // lib/content-guides/platforms.ts
  export const PLATFORM_GUIDES: Readonly<Record<SocialPlatform, string>>;
  // lib/content-guides/repurpose.ts
  export const REPURPOSE_GUIDE: string;
  export const PIECE_GUIDES: Readonly<Record<PieceKind, string>>;
  // lib/content-guides/voice-default.ts
  export const DEFAULT_VOICE_GUIDE: string;
  // lib/drafts/lint.ts
  export const PLATFORM_LIMITS: {
    readonly x: { readonly maxChars: 280; readonly maxParts: 10; readonly maxHashtags: 2; readonly maxCashtags: 1 };
    readonly linkedin: { readonly maxChars: 3000; readonly maxParts: 1; readonly maxHashtags: 3 };
    readonly threads: { readonly maxChars: 500; readonly maxParts: 10; readonly maxHashtags: 1; readonly maxLinks: 5 };
  };
  export type LintCode = "empty" | "too_long" | "too_many_parts" | "banned_phrase" | "em_dash" | "link_on_x" | "too_many_links" | "too_many_hashtags" | "too_many_cashtags";
  export type LintIssue = { readonly code: LintCode; readonly severity: "error" | "warning"; readonly message: string; readonly part?: number };
  export function countPostChars(platform: SocialPlatform, text: string): number;
  export function lintPost(input: { readonly platform: SocialPlatform; readonly posts: readonly string[]; readonly allowLinks: boolean }): LintIssue[];
  export function lintText(text: string): LintIssue[]; // banned phrases and em dashes only; used for pieces
  export function hasLintErrors(issues: readonly LintIssue[]): boolean;
  export function containsLink(text: string): boolean;
  ```
- Rules that `lintPost` enforces:
  - `part` is 1-based, and only set for posts in a thread.
  - **`empty`** (error): when there are no posts, or any post is blank after trimming.
  - **`too_many_parts`** (error): more posts than `maxParts`.
  - **`too_long`** (error), counted per post:
    - X counts every `https?://…` or `www.…` URL as 23 characters and everything else by code point (`Array.from`);
    - LinkedIn and Threads count every code point.
  - **`banned_phrase`** (error): any `BANNED_PATTERNS` match. The message names the label.
  - **`em_dash`** (error): any `—` (U+2014).
  - **`link_on_x`** (error): an X post contains a link and `allowLinks` is false.
  - **`too_many_links`** (error): Threads, more than 5 links in one post.
  - **`too_many_cashtags`** (error): X, more than one `$TICKER` (`/\$[A-Za-z]{1,6}\b/g`) across the draft.
  - **`too_many_hashtags`** (warning): more than `maxHashtags` hashtags (`/#[\p{L}\p{N}_]+/gu`) across the draft.
- `BANNED_PATTERNS` holds exactly these, all case-insensitive:

  | Label | Pattern |
  |---|---|
  | `delve` | `/\bdelv(?:e\|es\|ed\|ing)\b/i` |
  | `tapestry` | `/\btapestr(?:y\|ies)\b/i` |
  | `testament to` | `/\btestament to\b/i` |
  | `in today's fast-paced world` | `/\bin today['’]s fast[- ]paced world\b/i` |
  | `game-changer` | `/\bgame[- ]chang(?:er\|ers\|ing)\b/i` |
  | `unlock the power` | `/\bunlock(?:ing)? the (?:power\|potential)\b/i` |
  | `let's dive in` | `/\blet['’]s dive (?:in\|into)\b/i` |
  | `navigate the complexities` | `/\bnavigat(?:e\|ing) the complexit(?:y\|ies)\b/i` |
  | `ever-evolving` | `/\bever[- ]evolving\b/i` |
  | `elevate your` | `/\belevat(?:e\|es\|ing) your\b/i` |
  | `in conclusion` | `/\bin conclusion\b/i` |

- [ ] **Step 1: Write `lib/drafts/lint.test.ts`.**

```ts
import { describe, expect, it } from "vitest";
import { countPostChars, hasLintErrors, lintPost, lintText } from "@/lib/drafts/lint";

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);

describe("countPostChars", () => {
  it("counts an X url as 23", () => expect(countPostChars("x", "see https://example.com/a/very/long/path/indeed")).toBe(4 + 23));
  it("counts emoji as one code point", () => expect(countPostChars("threads", "hi 👋")).toBe(4));
});

describe("lintPost", () => {
  it("passes a clean X post", () => expect(lintPost({ platform: "x", posts: ["Shipping beats planning."], allowLinks: false })).toEqual([]));
  it("flags an X post over 280", () => expect(codes(lintPost({ platform: "x", posts: ["a".repeat(281)], allowLinks: false }))).toEqual(["too_long"]));
  it("checks each thread part and numbers it", () => {
    const issues = lintPost({ platform: "x", posts: ["ok", "b".repeat(300)], allowLinks: false });
    expect(issues).toMatchObject([{ code: "too_long", part: 2, severity: "error" }]);
  });
  it("flags a Threads post over 500 but not one of 500", () => {
    expect(codes(lintPost({ platform: "threads", posts: ["c".repeat(501)], allowLinks: true }))).toEqual(["too_long"]);
    expect(lintPost({ platform: "threads", posts: ["c".repeat(500)], allowLinks: true })).toEqual([]);
  });
  it("flags LinkedIn over 3000 and more than one part", () => {
    expect(codes(lintPost({ platform: "linkedin", posts: ["d".repeat(3001)], allowLinks: true }))).toEqual(["too_long"]);
    expect(codes(lintPost({ platform: "linkedin", posts: ["a", "b"], allowLinks: true }))).toEqual(["too_many_parts"]);
  });
  it("flags links on X unless allowed", () => {
    expect(codes(lintPost({ platform: "x", posts: ["read https://a.co"], allowLinks: false }))).toEqual(["link_on_x"]);
    expect(lintPost({ platform: "x", posts: ["read https://a.co"], allowLinks: true })).toEqual([]);
  });
  it("flags banned phrases, em dashes and blank posts", () => {
    expect(codes(lintPost({ platform: "linkedin", posts: ["Let's delve into it — fast."], allowLinks: true }))).toEqual(["banned_phrase", "em_dash"]);
    expect(codes(lintPost({ platform: "x", posts: ["  "], allowLinks: false }))).toEqual(["empty"]);
  });
  it("warns, without erroring, on too many hashtags", () => {
    const issues = lintPost({ platform: "threads", posts: ["#one #two"], allowLinks: true });
    expect(issues).toMatchObject([{ code: "too_many_hashtags", severity: "warning" }]);
    expect(hasLintErrors(issues)).toBe(false);
  });
  it("errors on a second cashtag on X", () => expect(codes(lintPost({ platform: "x", posts: ["$AAPL vs $MSFT"], allowLinks: false }))).toEqual(["too_many_cashtags"]));
  it("flags more than 5 links in one Threads post", () => {
    const post = Array.from({ length: 6 }, (_, i) => `https://a.co/${i}`).join(" ");
    expect(codes(lintPost({ platform: "threads", posts: [post], allowLinks: true }))).toEqual(["too_many_links"]);
  });
});

describe("lintText", () => {
  it("checks only phrases and dashes", () => expect(codes(lintText("A tapestry — of ideas"))).toEqual(["banned_phrase", "em_dash"]));
});
```

- [ ] **Step 2: Write `lib/content-guides/content-guides.test.ts`.** These are cheap guards that the guides carry the spec's numbers and rules:
  - `PLATFORM_GUIDES.x` contains `"280"` and `"$0.20"`;
  - `PLATFORM_GUIDES.threads` contains `"500"`;
  - `PLATFORM_GUIDES.linkedin` contains `"3,000"`;
  - `ANTI_AI_RULES` mentions `"em dash"`;
  - `DEFAULT_VOICE_GUIDE` mentions `"sentence case"` and `"straight quotes"`;
  - `ANTI_AI_RULES` contains every `BANNED_PATTERNS` label, because the writer needs the list;
  - no guide string contains an em dash (`—`).
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/drafts/lint lib/content-guides`. Expected: FAIL.
- [ ] **Step 4: Write the guides.** They are plain-English markdown strings, short and specific.
  - **`VIRAL_HOOKS_GUIDE`:** 8 to 10 opening-line patterns with one example each, and the anti-patterns: questions nobody asked, "Here's the thing", throat-clearing, hype.
  - **`PLATFORM_GUIDES`:**
    - X: 280 characters per post, threads of up to 10 posts, no links by default because a post with a link costs $0.20, at most 2 hashtags and at most 1 cashtag;
    - LinkedIn: the hook within the first 2 lines (about 210 characters show before "see more"), short paragraphs, no hashtag stuffing (at most 3, at the end), up to 3,000 characters;
    - Threads: up to 500 characters, conversational, 1 topic tag, at most 5 links.
  - **`REPURPOSE_GUIDE`:** source to posts, a reel script or a carousel outline.
  - **`PIECE_GUIDES`:**
    - reel script: hook in the first 2 seconds, 5 to 8 beats, each with visual, voiceover and on-screen text, plus a caption;
    - carousel outline: a cover slide, then 5 to 9 slides, one idea per slide, a final call to action, a cover image prompt and a caption.
  - **`DEFAULT_VOICE_GUIDE`** (spec 8.4): sentence case, no em dashes, straight quotes, no hype vocabulary, no rule-of-three filler, concrete specifics over abstractions, first person, short sentences.
  - **`ANTI_AI_RULES`:** the same writing rules as bullets, plus "never use the phrases in the banned list".
- [ ] **Step 5: Implement `lib/drafts/lint.ts`** as specified.
- [ ] **Step 6: Create the five skills.** Each is `export default defineSkill({ description, markdown })`, with `defineSkill` from `"eve/skills"` and `markdown` imported from `lib/content-guides`. Each description is a routing trigger:
  - `viral-hooks`: "Use when writing or judging the opening line of a post, thread, reel or carousel."
  - `platform-x`: "Use when writing, checking or editing a post or thread for X."
  - `platform-linkedin`: the same, for LinkedIn.
  - `platform-threads`: the same, for Threads.
  - `repurpose` (with `deferred: true`): "Use when turning a link, article, transcript or long text into posts, a reel script or a carousel outline."
- [ ] **Step 7: Run the checks.** Run `pnpm test` and `pnpm eve:build`. Expected: all pass, and `eve build` succeeds with five skills listed.
- [ ] **Step 8: Commit.**

```bash
git add lib/content-guides lib/drafts/lint.ts lib/drafts/lint.test.ts agent/skills
git commit -m "feat(drafts): platform and hook guides, draft lint, and content skills"
```

---

### Task 3: Voice store, example selection and pasted examples

**Files:**
- Create: `lib/voice/store.ts`, `lib/voice/exemplars.ts`, `lib/voice/paste.ts`
- Modify: `lib/db/brands.ts` (add `getBrandSettings`, `setBrandTimezone`)
- Create: `lib/time-zone.ts`
- Test: `lib/voice/store.test.ts`, `lib/voice/exemplars.test.ts`, `lib/voice/paste.test.ts`, `lib/time-zone.test.ts`

**Interfaces:**
- Consumes: Task 1 tables; `DEFAULT_VOICE_GUIDE` from Task 2.
- Produces:
  ```ts
  // lib/voice/store.ts
  export type VoiceGuideSource = "default" | "manual" | "harpy" | "restore";
  export type VoiceGuide = { readonly id: string; readonly brandId: string; readonly version: number; readonly body: string; readonly source: VoiceGuideSource; readonly note: string; readonly createdAt: string };
  export type VoiceExample = { readonly id: string; readonly brandId: string; readonly platform: SocialPlatform | null; readonly text: string; readonly source: "pasted" | "published"; readonly createdAt: string };
  export type VoicePreference = { readonly id: string; readonly brandId: string; readonly text: string; readonly source: "owner" | "chat"; readonly createdAt: string };
  export const VOICE_GUIDE_MAX_CHARS = 12_000;
  export const VOICE_EXAMPLE_MIN_CHARS = 20;
  export const VOICE_EXAMPLE_MAX_CHARS = 5_000;
  export const VOICE_PREFERENCE_MAX_CHARS = 300;
  export function getActiveVoiceGuide(brandId: string): Promise<VoiceGuide>;
  export function listVoiceGuideVersions(brandId: string, limit?: number): Promise<VoiceGuide[]>; // newest first, default 10
  export function saveVoiceGuideVersion(input: { readonly brandId: string; readonly body: string; readonly source: Exclude<VoiceGuideSource, "default">; readonly note?: string; readonly userId: string | null; readonly basedOnVersion: number }): Promise<{ readonly ok: true; readonly guide: VoiceGuide } | { readonly ok: false; readonly reason: "stale"; readonly latest: VoiceGuide }>;
  export function restoreVoiceGuideVersion(input: { readonly brandId: string; readonly version: number; readonly userId: string }): Promise<{ readonly ok: true; readonly guide: VoiceGuide } | { readonly ok: false; readonly reason: "not_found" | "stale" }>;
  export function addVoiceExamples(input: { readonly brandId: string; readonly platform: SocialPlatform | null; readonly texts: readonly string[] }): Promise<VoiceExample[]>;
  export function listVoiceExamples(brandId: string, limit?: number): Promise<VoiceExample[]>; // newest first, default 100
  export function deleteVoiceExample(brandId: string, id: string): Promise<boolean>;
  export function addVoicePreference(input: { readonly brandId: string; readonly text: string; readonly source: "owner" | "chat" }): Promise<VoicePreference>;
  export function listVoicePreferences(brandId: string, limit?: number): Promise<VoicePreference[]>; // newest first, default 50
  export function deleteVoicePreference(brandId: string, id: string): Promise<boolean>;
  // lib/voice/exemplars.ts
  export function keywordSet(text: string): Set<string>;
  export function selectExemplars(examples: readonly VoiceExample[], query: { readonly text: string; readonly platform: SocialPlatform | null; readonly limit: number }): VoiceExample[];
  // lib/voice/paste.ts
  export const MAX_PASTED_EXAMPLES = 50;
  export function splitPastedExamples(raw: string): string[];
  // lib/db/brands.ts
  export function getBrandSettings(brandId: string): Promise<{ readonly timezone: string; readonly name: string } | null>;
  export function setBrandTimezone(brandId: string, timezone: string): Promise<void>;
  // lib/time-zone.ts
  export function isValidTimeZone(value: string): boolean;
  ```
- Rules:
  - **`getActiveVoiceGuide`** inserts version 1 (`source: "default"`, body `DEFAULT_VOICE_GUIDE`) with `onConflictDoNothing` on `(brand_id, version)` when the brand has none. It then selects the highest version.
  - **`saveVoiceGuideVersion`** inserts `version = basedOnVersion + 1` with `onConflictDoNothing`. If no row comes back, it returns `stale` with the latest guide. It trims the body and throws if the body is empty or longer than `VOICE_GUIDE_MAX_CHARS`.
  - **`restoreVoiceGuideVersion`** copies the chosen version's body into a new top version with `source: "restore"` and note `Restored version N`.
  - **`addVoiceExamples`** trims every text, drops any outside the min and max lengths, caps the batch at `MAX_PASTED_EXAMPLES`, and inserts them in one statement.
  - **`keywordSet`** lowercases, splits on non-letters and non-digits (`/[^\p{L}\p{N}]+/u`), keeps words of 4 or more characters, and drops a short stopword list (`that this with from have your about into just they them what when will would there their`).
  - **`selectExemplars`** scores each example as `2 × |shared keywords| + (platform match ? 1 : 0)`. It sorts by score descending, then `createdAt` descending, then returns the first `limit`.
  - **`splitPastedExamples`** splits on lines that are exactly `---` (trimmed). If the paste has no `---` line, it splits on two or more blank lines. It trims each piece, drops pieces shorter than `VOICE_EXAMPLE_MIN_CHARS`, and caps the result at `MAX_PASTED_EXAMPLES`.

- [ ] **Step 1: Write the tests.**

```ts
// lib/voice/exemplars.test.ts
import { describe, expect, it } from "vitest";
import { keywordSet, selectExemplars } from "@/lib/voice/exemplars";

const ex = (id: string, text: string, platform: "x" | "linkedin" | null, createdAt: string) =>
  ({ id, brandId: "b", platform, text, source: "pasted" as const, createdAt });

describe("selectExemplars", () => {
  const examples = [
    ex("old-linkedin", "Hiring engineers is mostly about writing", "linkedin", "2026-01-01T00:00:00Z"),
    ex("new-x", "Pricing pages lie about pricing", "x", "2026-03-01T00:00:00Z"),
    ex("match-x", "Hiring engineers taught me pricing", "x", "2026-02-01T00:00:00Z"),
  ];
  it("prefers keyword overlap, then platform, then recency", () => {
    expect(selectExemplars(examples, { text: "what hiring engineers taught me", platform: "x", limit: 2 }).map((e) => e.id))
      .toEqual(["match-x", "old-linkedin"]);
  });
  it("falls back to recency when nothing overlaps", () => {
    expect(selectExemplars(examples, { text: "zzz", platform: null, limit: 1 }).map((e) => e.id)).toEqual(["new-x"]);
  });
  it("drops short words and stopwords", () => expect([...keywordSet("This is about Hiring, with Joy")]).toEqual(["hiring"]));
});
```

```ts
// lib/voice/paste.test.ts
import { describe, expect, it } from "vitest";
import { splitPastedExamples } from "@/lib/voice/paste";

describe("splitPastedExamples", () => {
  const long = (s: string) => `${s} ${"x".repeat(30)}`;
  it("splits on --- lines", () => expect(splitPastedExamples(`${long("one")}\n---\n${long("two")}`)).toHaveLength(2));
  it("falls back to blank lines", () => expect(splitPastedExamples(`${long("one")}\n\n\n${long("two")}`)).toHaveLength(2));
  it("drops tiny pieces", () => expect(splitPastedExamples("hi\n---\n" + long("ok"))).toHaveLength(1));
  it("caps at 50", () => expect(splitPastedExamples(Array.from({ length: 60 }, (_, i) => long(`p${i}`)).join("\n---\n"))).toHaveLength(50));
});
```

  `lib/time-zone.test.ts` covers:
  - `isValidTimeZone("Asia/Kolkata")` is true;
  - `isValidTimeZone("Mars/Base")` is false;
  - `isValidTimeZone("")` is false.

  `lib/voice/store.test.ts` mocks `@/lib/db/client` with the recording fake from `lib/db/mcp.test.ts` and covers:
  - `getActiveVoiceGuide` inserts version 1 with source `"default"` when the select returns no rows, then returns it;
  - `saveVoiceGuideVersion` with `basedOnVersion: 3` inserts version 4, and returns `{ ok: false, reason: "stale" }` when the insert returns no rows;
  - `saveVoiceGuideVersion` throws on a blank body;
  - `addVoiceExamples` drops a 10-character text and inserts the rest in one `values([...])` call;
  - `deleteVoiceExample` filters on both `id` and `brand_id`; render the where clause with `PgDialect` and expect `"brand_id" = $`.
- [ ] **Step 2: Run them.** Run `pnpm vitest run lib/voice lib/time-zone`. Expected: FAIL.
- [ ] **Step 3: Implement the four modules and the two brand functions.**
  - `isValidTimeZone` returns `false` for an empty string, and otherwise tries `new Intl.DateTimeFormat("en-US", { timeZone: value })`.
  - `setBrandTimezone` updates `brand.timezone` and `updated_at`.
- [ ] **Step 4: Run them again.** Run `pnpm vitest run lib/voice lib/time-zone`. Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add lib/voice lib/db/brands.ts lib/time-zone.ts lib/time-zone.test.ts
git commit -m "feat(voice): versioned voice guide, examples, preferences and exemplar selection"
```

---

### Task 4: Draft store and review actions

**Files:**
- Create: `lib/drafts/records.ts`, `lib/drafts/store.ts`, `lib/drafts/thread-text.ts`, `lib/review.ts`
- Test: `lib/drafts/store.test.ts`, `lib/drafts/thread-text.test.ts`, `lib/review.test.ts`

**Interfaces:**
- Consumes: Task 1 types, state and tables.
- Produces:
  ```ts
  // lib/drafts/records.ts
  export type DraftRecord = {
    readonly id: string; readonly ideaId: string; readonly brandId: string; readonly platform: SocialPlatform;
    readonly status: DraftState; readonly revision: number; readonly hook: string; readonly text: string;
    readonly posts: readonly string[]; // thread_parts when set, else [text]
    readonly mediaIds: readonly string[]; readonly imagePrompt: string | null; readonly scheduledAt: string | null;
    readonly approvedAt: string | null; readonly approvedVia: ApprovedVia | null; readonly notes: string;
    readonly revisionRequestedAt: string | null; readonly externalUrl: string | null;
    readonly createdAt: string; readonly updatedAt: string;
  };
  export type IdeaRecord = { readonly id: string; readonly brandId: string; readonly text: string; readonly sourceKind: IdeaSourceKind; readonly sourceChannel: IdeaSourceChannel; readonly sourceRef: string | null; readonly requested: IdeaRequest; readonly draftRequestedAt: string | null; readonly createdAt: string };
  export type ReelScriptBody = { readonly hook: string; readonly beats: readonly { readonly visual: string; readonly voiceover: string; readonly onScreenText: string }[]; readonly caption: string; readonly notes: string };
  export type CarouselOutlineBody = { readonly slides: readonly { readonly heading: string; readonly body: string }[]; readonly coverImagePrompt: string | null; readonly caption: string; readonly notes: string };
  export type ContentPieceRecord = { readonly id: string; readonly ideaId: string; readonly brandId: string; readonly kind: PieceKind; readonly title: string; readonly body: ReelScriptBody | CarouselOutlineBody; readonly mediaIds: readonly string[]; readonly createdAt: string; readonly updatedAt: string };
  export function toDraftRecord(row: Draft): DraftRecord;
  export function rawDraftRow(row: Record<string, unknown>): Draft; // snake_case db.execute row -> Draft (dates from string or Date)
  export function toIdeaRecord(row: Idea): IdeaRecord;
  export function toContentPieceRecord(row: ContentPiece): ContentPieceRecord;

  // lib/drafts/thread-text.ts
  export const EDIT_SEPARATOR = "\n---\n";
  export function postsToText(posts: readonly string[]): string;      // posts.join("\n\n") for display and draft.text
  export function postsToEditText(posts: readonly string[]): string;  // posts.join(EDIT_SEPARATOR)
  export function editTextToPosts(text: string): string[];            // split on lines that are exactly ---, trim, drop empty

  // lib/drafts/store.ts
  export const IDEA_MAX_CHARS = 8_000;
  export function createIdea(input: { readonly brandId: string; readonly userId: string | null; readonly text: string; readonly sourceKind: IdeaSourceKind; readonly sourceChannel: IdeaSourceChannel; readonly sourceRef?: string | null; readonly requested: IdeaRequest }): Promise<IdeaRecord>; // draft_requested_at = now()
  export function markIdeaRequested(brandId: string, ideaId: string): Promise<IdeaRecord | null>;
  export function getIdea(brandId: string, ideaId: string): Promise<IdeaRecord | null>;
  export function listDraftsForIdea(brandId: string, ideaId: string): Promise<DraftRecord[]>;
  export function listPiecesForIdea(brandId: string, ideaId: string): Promise<ContentPieceRecord[]>;
  export function getDraft(brandId: string, draftId: string): Promise<DraftRecord | null>;
  export function listDrafts(brandId: string, options: { readonly status?: DraftState; readonly limit: number }): Promise<DraftRecord[]>;
  export type SaveGeneratedDraftInput = { readonly brandId: string; readonly ideaId: string; readonly platform: SocialPlatform; readonly hook: string; readonly posts: readonly string[]; readonly imagePrompt: string | null; readonly scheduledAt: string | null; readonly notes: string; readonly mode: "create" | { readonly expectedRevision: number } };
  export function saveGeneratedDraft(input: SaveGeneratedDraftInput): Promise<{ readonly ok: true; readonly draft: DraftRecord; readonly created: boolean } | { readonly ok: false; readonly reason: "stale" | "not_found"; readonly draft: DraftRecord | null }>;
  export function saveContentPiece(input: { readonly brandId: string; readonly ideaId: string; readonly kind: PieceKind; readonly title: string; readonly body: ReelScriptBody | CarouselOutlineBody; readonly mode: "create" | "replace" }): Promise<{ readonly piece: ContentPieceRecord; readonly created: boolean }>;
  export function setDraftMedia(input: { readonly brandId: string; readonly draftId: string; readonly revision: number; readonly mediaIds: readonly string[] }): Promise<boolean>;
  export function setPieceMedia(input: { readonly brandId: string; readonly pieceId: string; readonly mediaIds: readonly string[] }): Promise<boolean>;

  // lib/review.ts
  export type ReviewFailure = "not_found" | "stale" | "invalid_state";
  export type ReviewResult = { readonly ok: true; readonly draft: DraftRecord } | { readonly ok: false; readonly reason: ReviewFailure; readonly draft: DraftRecord | null };
  export function failureFor(current: DraftRecord | null, expectedRevision: number | null, action: ReviewAction): ReviewFailure; // pure
  export function reviewFailureMessage(reason: ReviewFailure): string;
  export function approveDraft(input: { readonly brandId: string; readonly draftId: string; readonly expectedRevision: number; readonly via: ApprovedVia }): Promise<ReviewResult>;
  export function skipDraft(input: { readonly brandId: string; readonly draftId: string; readonly expectedRevision: number }): Promise<ReviewResult>;
  export function restoreDraft(input: { readonly brandId: string; readonly draftId: string }): Promise<ReviewResult>;
  export function saveManualEdit(input: { readonly brandId: string; readonly draftId: string; readonly expectedRevision: number; readonly posts: readonly string[]; readonly userId: string }): Promise<ReviewResult>;
  export function requestRevision(input: { readonly brandId: string; readonly draftId: string; readonly expectedRevision: number }): Promise<ReviewResult>;
  export function completeRevision(input: { readonly brandId: string; readonly draftId: string; readonly expectedRevision: number; readonly hook: string; readonly posts: readonly string[]; readonly imagePrompt: string | null; readonly instruction: string; readonly userId: string | null }): Promise<ReviewResult>;
  export function clearRevisionRequest(brandId: string, draftId: string): Promise<void>;
  export function setProposedTime(input: { readonly brandId: string; readonly draftId: string; readonly scheduledAt: string | null }): Promise<ReviewResult>;
  ```
- SQL rules (these are the decisions the tests pin):
  - **Writes that touch both `draft` and `draft_revision`** are a single `db.execute(sql\`...\`)`. They are:
    - `saveGeneratedDraft`, in both modes;
    - `saveManualEdit`;
    - `completeRevision`.
  - **Create mode:** `with ins as (insert into "draft" ... on conflict ("idea_id", "platform") do nothing returning *), rev as (insert into "draft_revision" (...) select ..., 1, 'generated', ... from ins on conflict ("draft_id", "revision") do nothing) select * from ins`. When no row comes back, select the existing draft and return `{ ok: true, created: false }`.
  - **Revision writes:** `with upd as (update "draft" set ..., "revision" = "revision" + 1, "status" = 'pending_review', "approved_at" = null, "approved_via" = null, "revision_requested_at" = null, "updated_at" = now() where "id" = $ and "brand_id" = $ and "revision" = $ and "status" in ('pending_review','approved') returning *), rev as (insert into "draft_revision" ... select ... from upd) select * from upd`.
    - The revision kind is `generated` for redrafts, `manual_edit` for `saveManualEdit`, and `user_edit_request` for `completeRevision`, which also stores `instruction`.
  - **Approve, skip, restore, request revision and set proposed time** are single guarded `update ... where id and brand_id [and revision] and status in (...) returning *` statements.
    - Approve sets `approved_at = now()` and `approved_via`.
    - Skip and restore change only `status`.
    - Every one of them sets `updated_at = now()`.
    - `setProposedTime` only applies to `pending_review`.
  - **When a guarded write returns no row,** load the draft with `getDraft` and return `{ ok: false, reason: failureFor(current, expectedRevision, action), draft: current }`:
    - `failureFor` returns `not_found` when `current` is null;
    - `stale` when `expectedRevision !== null && current.revision !== expectedRevision`;
    - otherwise `invalid_state`.
  - `draft.text` is always `postsToText(posts)`, and `thread_parts` is `posts` when `posts.length > 1`, else null.
  - `reviewFailureMessage` copy:
    - not_found: "That draft is gone.";
    - stale: "That draft changed. Showing the latest.";
    - invalid_state: "That draft can't do that right now."

- [ ] **Step 1: Write `lib/drafts/thread-text.test.ts`.**
  - Round trip: `editTextToPosts(postsToEditText(["a", "b"]))` equals `["a", "b"]`.
  - `editTextToPosts("one\n---\n\n---\ntwo")` equals `["one", "two"]`.
  - `postsToText(["a", "b"])` equals `"a\n\nb"`.
- [ ] **Step 2: Write `lib/review.test.ts`.** Mock `@/lib/db/client` as `{ db: { execute: vi.fn() } }`, plus the select chain that `getDraft` uses. Render the captured `sql` with `new PgDialect().sqlToQuery(captured).sql`.

```ts
it("approve is guarded by brand, revision and state", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ status: "approved", approved_via: "web" })] });
  const result = await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" });
  expect(result).toMatchObject({ ok: true, draft: { status: "approved", approvedVia: "web" } });
  const text = render(mocks.execute.mock.calls[0][0]);
  expect(text).toContain('"brand_id" = $');
  expect(text).toContain('"revision" = $');
  expect(text).toMatch(/"status" in \(/);
});
it("approve on an approved draft reports invalid_state with the current draft", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: [] });
  mocks.getDraftRows.mockResolvedValueOnce([draftRow({ status: "approved", revision: 2 })]);
  expect(await approveDraft({ brandId: "b1", draftId: "d1", expectedRevision: 2, via: "web" }))
    .toMatchObject({ ok: false, reason: "invalid_state", draft: { status: "approved" } });
});
it("a save on an old revision is stale", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: [] });
  mocks.getDraftRows.mockResolvedValueOnce([draftRow({ revision: 3 })]);
  expect(await saveManualEdit({ brandId: "b1", draftId: "d1", expectedRevision: 2, posts: ["new"], userId: "u1" }))
    .toMatchObject({ ok: false, reason: "stale" });
});
it("a manual edit writes the draft and its revision in one statement", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: [rawRow({ revision: 3, text: "new" })] });
  await saveManualEdit({ brandId: "b1", draftId: "d1", expectedRevision: 2, posts: ["new"], userId: "u1" });
  const text = render(mocks.execute.mock.calls[0][0]);
  expect(text).toMatch(/^with upd as \(update "draft"/i);
  expect(text).toContain('insert into "draft_revision"');
  expect(text).toContain("'manual_edit'");
  expect(mocks.execute).toHaveBeenCalledTimes(1);
});
it("a missing draft is not_found", async () => {
  mocks.execute.mockResolvedValueOnce({ rows: [] });
  mocks.getDraftRows.mockResolvedValueOnce([]);
  expect(await skipDraft({ brandId: "b1", draftId: "nope", expectedRevision: 1 })).toMatchObject({ ok: false, reason: "not_found", draft: null });
});
it.each([["not_found", null, 1], ["stale", 3, 2], ["invalid_state", 2, 2]] as const)(
  "failureFor gives %s", (reason, currentRevision, expected) =>
    expect(failureFor(currentRevision === null ? null : record({ revision: currentRevision }), expected, "approve")).toBe(reason));
```

  `rawRow`, `draftRow` and `record` are local fixture helpers. Write them in the test file.
- [ ] **Step 3: Write `lib/drafts/store.test.ts`.**
  - `saveGeneratedDraft({ mode: "create", ... })` renders SQL containing `on conflict ("idea_id", "platform") do nothing` and `insert into "draft_revision"` in one statement.
  - With `{ rows: [] }`, it selects the existing draft and returns `{ ok: true, created: false }`.
  - `{ mode: { expectedRevision: 1 } }` renders `"revision" = $` and `'generated'`.
  - `createIdea` sets `draftRequestedAt` and stores `requested` as given.
  - `saveContentPiece({ mode: "create" })` uses `onConflictDoNothing` on `(idea_id, kind)`, and `"replace"` uses `onConflictDoUpdate`.
  - Every exported read and write filters on `brand_id`. Assert this for `getDraft`, `listDraftsForIdea`, `setDraftMedia` and `setPieceMedia`.
  - A two-post X save stores `thread_parts` as both posts and `text` as `"a\n\nb"`.
- [ ] **Step 4: Run them.** Run `pnpm vitest run lib/review lib/drafts`. Expected: FAIL.
- [ ] **Step 5: Implement `records.ts`, `thread-text.ts`, `store.ts` and `review.ts`** to the rules above. Reads use the query builder; the listed writes use `db.execute(sql...)`.
- [ ] **Step 6: Run the checks.** Run `pnpm vitest run lib/review lib/drafts`, then `pnpm typecheck`. Expected: PASS, no errors.
- [ ] **Step 7: Commit.**

```bash
git add lib/drafts lib/review.ts lib/review.test.ts
git commit -m "feat(drafts): draft store and deterministic review actions with stale and brand guards"
```

---

### Task 5: Writer subagent and briefs

**Files:**
- Create: `lib/drafts/writer.ts`, `lib/drafts/writer-instructions.ts`
- Create: `agent/subagents/writer/agent.ts`, `agent/subagents/writer/instructions.ts`
- Test: `lib/drafts/writer.test.ts`

**Interfaces:**
- Consumes: Task 2 guides and lint; Task 1 types; `exceedsSessionBudget` from `lib/agent-limits.ts`.
- Produces:
  ```ts
  // lib/drafts/writer.ts
  export const POST_OUTPUT_SCHEMA: z.ZodObject<...>; // { platform: enum(SOCIAL_PLATFORM_KEYS), hook: string, posts: string[] (1..10), imagePrompt: string | null, suggestedTime: string | null, notes: string }
  export const REEL_OUTPUT_SCHEMA: z.ZodObject<...>; // { title: string, hook: string, beats: { visual, voiceover, onScreenText }[] (3..12), caption: string, notes: string }
  export const CAROUSEL_OUTPUT_SCHEMA: z.ZodObject<...>; // { title: string, slides: { heading, body }[] (3..12), coverImagePrompt: string | null, caption: string, notes: string }
  export type PostOutput = z.infer<typeof POST_OUTPUT_SCHEMA>;
  export type ReelOutput = z.infer<typeof REEL_OUTPUT_SCHEMA>;
  export type CarouselOutput = z.infer<typeof CAROUSEL_OUTPUT_SCHEMA>;
  export type WriterOutput = PostOutput | ReelOutput | CarouselOutput;
  export type DraftSource = { readonly url: string | null; readonly title: string | null; readonly text: string };
  export const MAX_SOURCES = 3;
  export const SOURCE_TEXT_MAX_CHARS = 12_000;
  export const SOURCES_TOTAL_MAX_CHARS = 24_000;
  export type WriterBrief = {
    readonly target: DraftTarget; readonly now: string; readonly timezone: string;
    readonly voiceGuide: string; readonly preferences: readonly string[];
    readonly exemplars: readonly { readonly platform: SocialPlatform | null; readonly text: string }[];
    readonly idea: string; readonly sources: readonly DraftSource[]; readonly allowLinksOnX: boolean;
  };
  export function outputSchemaFor(target: DraftTarget): typeof POST_OUTPUT_SCHEMA | typeof REEL_OUTPUT_SCHEMA | typeof CAROUSEL_OUTPUT_SCHEMA;
  export function buildWriterMessage(brief: WriterBrief): string;
  export function buildRepairMessage(issues: readonly LintIssue[]): string;
  export function buildRevisionMessage(input: { readonly brief: WriterBrief; readonly currentPosts: readonly string[]; readonly instruction: string }): string;
  export function normalizeSuggestedTime(value: string | null, now: Date): string | null; // ISO UTC, or null
  export function postsForPlatform(platform: SocialPlatform, posts: readonly string[]): string[];
  export function parseWriterOutput(target: DraftTarget, data: unknown): { readonly ok: true; readonly output: WriterOutput } | { readonly ok: false; readonly message: string };
  // lib/drafts/writer-instructions.ts
  export const WRITER_INSTRUCTIONS: string;
  ```
- What the functions do:
  - **`buildWriterMessage`** has these sections, in this order:
    - `## Task`: what to write and for which platform or piece;
    - `## Now`: `brief.now` shown in `brief.timezone`, plus the zone name;
    - `## Platform rules`: `PLATFORM_GUIDES[platform]`, or `PIECE_GUIDES[piece]`;
    - `## Voice guide`;
    - `## Owner preferences`: bullets, or "None yet.";
    - `## Examples of the owner's posts`: at most 4;
    - `## Idea`;
    - `## Sources`: at most `MAX_SOURCES`. Each source text is cut to `SOURCE_TEXT_MAX_CHARS`, and the total stops at `SOURCES_TOTAL_MAX_CHARS`. Each cut ends with `[truncated]`;
    - `## Output`: the field rules. `posts` holds one item for a single post. `imagePrompt` is null unless an image clearly helps. `suggestedTime` is ISO 8601 with offset, within the next 14 days, or null. For X, add "Do not include links." unless `allowLinksOnX`.
  - **`buildRepairMessage`** lists every error issue as `- <message>` and asks for the same output with those fixed, keeping the voice.
  - **`buildRevisionMessage`** is the writer message plus `## Current draft` and `## Requested change`.
  - **`normalizeSuggestedTime`** returns null for null, an unparseable value, a time earlier than `now + 10 minutes`, or one later than `now + 14 days`. Otherwise it returns `new Date(value).toISOString()`.
  - **`postsForPlatform`:**
    - trims each post and drops empty ones;
    - for LinkedIn, joins everything into one post with `"\n\n"`;
    - for X and Threads, returns the posts unchanged.
  - **`parseWriterOutput`** validates with the target's schema. It fails with "The writer returned the wrong shape." on a mismatch, and fails when a post output for one platform names another platform.
- **The writer subagent:**
  - `agent/subagents/writer/agent.ts` is:
    ```ts
    defineAgent({
      description: "Writes one post, thread, reel script or carousel outline in the owner's voice. Used by the draft_posts and revise_draft tools only.",
      model: "anthropic/claude-opus-5.5",
      reasoning: "high",
      tool: false,
      defaultTools: false,
      limits: { sessionUsage: exceedsSessionBudget },
    })
    ```
  - `agent/subagents/writer/instructions.ts` is `defineInstructions({ content: WRITER_INSTRUCTIONS })`. It contains:
    - the role: "You are harpy's writer. You write exactly the piece the task asks for, in the owner's voice.";
    - `ANTI_AI_RULES`;
    - `VIRAL_HOOKS_GUIDE`;
    - "Return only the requested structured output.";
    - "The platform rules and the owner's voice in each task override your defaults."

  The writer gets the hook and platform guidance in its instructions and its brief, not as skills, so it applies on every call.

- [ ] **Step 1: Write `lib/drafts/writer.test.ts`.**

```ts
const now = new Date("2026-10-24T10:00:00Z");
describe("normalizeSuggestedTime", () => {
  it("keeps a time 2 days out", () => expect(normalizeSuggestedTime("2026-10-26T09:30:00+05:30", now)).toBe("2026-10-26T04:00:00.000Z"));
  it.each([["past", "2026-10-23T09:00:00Z"], ["5 minutes", "2026-10-24T10:05:00Z"], ["too far", "2026-11-20T09:00:00Z"], ["junk", "Tuesday morning"]])(
    "drops %s", (_label, value) => expect(normalizeSuggestedTime(value, now)).toBeNull());
  it("passes null through", () => expect(normalizeSuggestedTime(null, now)).toBeNull());
});
describe("postsForPlatform", () => {
  it("joins LinkedIn parts", () => expect(postsForPlatform("linkedin", ["a ", "", " b"])).toEqual(["a\n\nb"]));
  it("keeps X thread parts", () => expect(postsForPlatform("x", ["a", " b "])).toEqual(["a", "b"]));
});
describe("buildWriterMessage", () => {
  const brief = { target: { kind: "post", platform: "x" }, now: now.toISOString(), timezone: "Asia/Kolkata", voiceGuide: "Write plainly.",
    preferences: ["No hashtags"], exemplars: [{ platform: "x", text: "Ship it." }], idea: "Small teams ship faster",
    sources: [{ url: "https://a.co", title: "A", text: "s".repeat(30_000) }], allowLinksOnX: false } as const;
  const message = buildWriterMessage(brief);
  it("orders the sections", () => {
    const order = ["## Task", "## Now", "## Platform rules", "## Voice guide", "## Owner preferences", "## Examples of the owner's posts", "## Idea", "## Sources", "## Output"]
      .map((h) => message.indexOf(h));
    expect(order.every((i, n) => i >= 0 && (n === 0 || i > order[n - 1]!))).toBe(true);
  });
  it("truncates a long source", () => { expect(message).toContain("[truncated]"); expect(message.length).toBeLessThan(20_000); });
  it("forbids links on X unless allowed", () => {
    expect(message).toContain("Do not include links.");
    expect(buildWriterMessage({ ...brief, allowLinksOnX: true })).not.toContain("Do not include links.");
  });
  it("shows the zone", () => expect(message).toContain("Asia/Kolkata"));
});
describe("parseWriterOutput", () => {
  it("rejects a platform mismatch", () => expect(parseWriterOutput({ kind: "post", platform: "x" },
    { platform: "linkedin", hook: "h", posts: ["p"], imagePrompt: null, suggestedTime: null, notes: "" })).toMatchObject({ ok: false }));
  it("rejects the wrong shape", () => expect(parseWriterOutput({ kind: "piece", piece: "reel_script" }, { posts: [] })).toMatchObject({ ok: false }));
});
```

- [ ] **Step 2: Run it.** Run `pnpm vitest run lib/drafts/writer`. Expected: FAIL.
- [ ] **Step 3: Implement both lib modules and the two subagent files.**
- [ ] **Step 4: Run the checks.** Run `pnpm vitest run lib/drafts/writer` and `pnpm eve:build`.
  - Expected: PASS. `eve build` lists the subagent `writer` and accepts the model id.
- [ ] **Step 5: Commit.**

```bash
git add lib/drafts/writer.ts lib/drafts/writer-instructions.ts lib/drafts/writer.test.ts agent/subagents
git commit -m "feat(agent): writer subagent with structured briefs and output schemas"
```

---

### Task 6: Drafting orchestration and the draft_posts tool

**Files:**
- Create: `lib/drafts/input.ts`, `lib/drafts/orchestrate.ts`, `lib/drafts/steps.ts`, `lib/drafts/limits.ts`
- Create: `lib/media/generate.ts`
- Modify: `agent/tools/generate_image.ts` (use `generateBrandImage`)
- Create: `agent/tools/draft_posts.ts`
- Test: `lib/drafts/orchestrate.test.ts`, `lib/drafts/input.test.ts`, `lib/media/generate.test.ts`

**Interfaces:**
- Consumes:
  - Task 3: `getActiveVoiceGuide`, `listVoicePreferences`, `listVoiceExamples`, `selectExemplars`, `getBrandSettings`;
  - Task 4: `createIdea`, `getIdea`, `listDraftsForIdea`, `listPiecesForIdea`, `saveGeneratedDraft`, `saveContentPiece`, `setDraftMedia`, `setPieceMedia`, `IDEA_MAX_CHARS`;
  - Task 5: everything in `lib/drafts/writer.ts`;
  - Task 2: `lintPost`, `lintText`, `hasLintErrors`;
  - `resolveBrandContext`, `enforceRateLimit`, `RateLimitError`, `errorMessage`.
- Produces:
  ```ts
  // lib/drafts/limits.ts
  export const DRAFT_RUNS_PER_HOUR = 20;
  export const REVISIONS_PER_HOUR = 40;
  // lib/drafts/input.ts
  export const DRAFT_POSTS_INPUT: z.ZodObject<...>;
  //   { ideaId?: string, idea?: string (1..IDEA_MAX_CHARS), sources?: { url?: string, title?: string, text: string (1..) }[] (max 3),
  //     platforms?: SocialPlatform[], pieces?: PieceKind[], redraft?: boolean, allowLinksOnX?: boolean }
  export type DraftPostsInput = z.infer<typeof DRAFT_POSTS_INPUT>;
  export function resolveTargets(input: { readonly platforms?: readonly SocialPlatform[]; readonly pieces?: readonly PieceKind[] }, requested: IdeaRequest | null): DraftTarget[];
  //   explicit input wins; else the idea's requested set; else all three platforms. Deduped, platforms first in x, linkedin, threads order.
  export function ideaSourceChannel(attributes: Record<string, unknown> | undefined): IdeaSourceChannel; // web|whatsapp|slack|eval, else "web"; never "studio" (only createIdeaAction sets that)
  // lib/drafts/orchestrate.ts
  export type DraftSummary = { readonly draftId: string; readonly platform: SocialPlatform; readonly revision: number; readonly hook: string; readonly posts: readonly string[]; readonly imageUrl: string | null; readonly imageError: string | null; readonly issues: readonly string[] };
  export type PieceSummary = { readonly pieceId: string; readonly kind: PieceKind; readonly title: string; readonly imageUrl: string | null };
  export type DraftPostsResult =
    | { readonly ok: true; readonly ideaId: string; readonly drafts: readonly DraftSummary[]; readonly pieces: readonly PieceSummary[];
        readonly skipped: readonly { readonly target: string; readonly reason: "already_drafted" }[];
        readonly failed: readonly { readonly target: string; readonly message: string }[] }
    | { readonly ok: false; readonly message: string };
  export type WriterReply = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly message: string };
  export interface WriterConversation { ask(message: string, target: DraftTarget): Promise<WriterReply> }
  export type DraftingPlan = {
    readonly ideaId: string; readonly now: string; readonly timezone: string; readonly voiceGuide: string;
    readonly preferences: readonly string[]; readonly idea: string; readonly sources: readonly DraftSource[];
    readonly allowLinksOnX: boolean; readonly redraft: boolean;
    readonly targets: readonly { readonly target: DraftTarget; readonly exemplars: WriterBrief["exemplars"];
      readonly existing: { readonly draftId: string; readonly revision: number } | { readonly pieceId: string } | null }[];
  };
  export interface DraftingDeps {
    openWriter(): WriterConversation;
    saveDraft(input: SaveGeneratedDraftInput): ReturnType<typeof saveGeneratedDraft>;
    savePiece(input: Parameters<typeof saveContentPiece>[0]): ReturnType<typeof saveContentPiece>;
    generateImage(prompt: string): Promise<{ readonly ok: true; readonly mediaId: string; readonly url: string } | { readonly ok: false; readonly message: string }>;
    attachDraftImage(input: { readonly draftId: string; readonly revision: number; readonly mediaId: string }): Promise<void>;
    attachPieceImage(input: { readonly pieceId: string; readonly mediaId: string }): Promise<void>;
  }
  export function writeTarget(conversation: WriterConversation, brief: WriterBrief, mode: { readonly kind: "draft" } | { readonly kind: "revise"; readonly currentPosts: readonly string[]; readonly instruction: string }):
    Promise<{ readonly ok: true; readonly output: WriterOutput; readonly issues: readonly LintIssue[] } | { readonly ok: false; readonly message: string }>;
  export function runDrafting(deps: DraftingDeps, plan: DraftingPlan): Promise<DraftPostsResult>;
  // lib/drafts/steps.ts ("use step" in every exported function)
  export function prepareDrafting(ctx: WorkflowStepToolContext, input: DraftPostsInput): Promise<{ readonly ok: true; readonly plan: DraftingPlan; readonly brandId: string; readonly userId: string } | { readonly ok: false; readonly message: string }>;
  export function saveDraftStep(input: SaveGeneratedDraftInput): ReturnType<typeof saveGeneratedDraft>;
  export function savePieceStep(input: Parameters<typeof saveContentPiece>[0]): ReturnType<typeof saveContentPiece>;
  export function generateImageStep(input: { readonly brandId: string; readonly userId: string; readonly prompt: string }): ReturnType<DraftingDeps["generateImage"]>;
  export function attachDraftImageStep(input: { readonly brandId: string; readonly draftId: string; readonly revision: number; readonly mediaId: string }): Promise<void>;
  export function attachPieceImageStep(input: { readonly brandId: string; readonly pieceId: string; readonly mediaId: string }): Promise<void>;
  // lib/media/generate.ts
  export function generateBrandImage(input: { readonly brandId: string; readonly userId: string; readonly prompt: string; readonly sourceImage?: SourceImage }):
    Promise<{ readonly ok: true; readonly mediaId: string; readonly url: string } | { readonly ok: false; readonly message: string }>;
  //   rate limit (IMAGE_GENERATIONS_PER_DAY, "image:generate", brandId, 86_400 s) -> generateOrEditImage -> saveMediaAsset(source "generated").
  //   The messages are the ones generate_image returns today.
  ```
- **`writeTarget` algorithm:**
  1. Ask once, with `buildWriterMessage` (or `buildRevisionMessage`).
  2. Parse with `parseWriterOutput`.
  3. Normalize with `postsForPlatform`.
  4. Lint: `lintPost` for posts, with `allowLinks = brief.allowLinksOnX || platform !== "x"`, or `lintText` over every string field for pieces.
  5. If there are lint errors, ask exactly once more with `buildRepairMessage(errors)`, then parse, normalize and lint again. If that second answer fails to parse, keep the first output.
  6. Return the latest output with its remaining issues.
  7. A writer failure, or a first parse failure, returns `{ ok: false }`.
  8. Empty posts after normalizing return `{ ok: false, message: "The writer returned an empty post." }`.
- **`runDrafting` algorithm:**
  - For each target in `plan.targets`, in parallel with `Promise.all` (one `openWriter()` per target):
    - **If the target exists and `!plan.redraft`:** push `{ target: targetKey, reason: "already_drafted" }` to `skipped`.
    - **Otherwise:** call `writeTarget`. A failure goes to `failed`.
    - **For a post:** call `saveDraft` with:
      - `mode` set to `"create"`, or `{ expectedRevision }` when redrafting an existing draft;
      - `scheduledAt` from `normalizeSuggestedTime(output.suggestedTime, new Date(plan.now))`;
      - `notes` from `output.notes`.

      A save that returns `{ ok: false }` goes to `failed` with "That draft changed while harpy was writing."
    - **For a piece:** call `savePiece` with `mode` set to `"create"`, or `"replace"` when redrafting. The title comes from the output, and the body is the output without `title`.
  - Then, in parallel, generate images:
    - for each saved draft with a non-null `imagePrompt`;
    - for each carousel with a non-null `coverImagePrompt`.

    Attach each one. An image failure sets `imageError` and never moves the draft to `failed`.
  - `issues` in each summary are the lint messages.
  - The result lists drafts in x, linkedin, threads order.
- **`prepareDrafting`:**
  - `resolveBrandContext(ctx)` returning null gives "You need to be signed in to draft posts."
  - It calls `enforceRateLimit` with `DRAFT_RUNS_PER_HOUR`, `"draft:run"` and an hour window. `RateLimitError` gives "Drafting limit reached (20 an hour). Try again later."
  - It needs exactly one of `ideaId` or `idea`; otherwise "Give me an idea to draft."
  - **With `ideaId`:** `getIdea` must find the idea, otherwise "That idea is gone." The idea's text is used.
  - **Without `ideaId`:** it calls `createIdea` with:
    - `sourceKind: "link"` when any source has a url, otherwise `"text"`;
    - `sourceChannel: ideaSourceChannel(attributes)`;
    - `sourceRef`: the first source url;
    - `requested`: the resolved targets split into platforms and pieces.
  - It loads the brand settings (time zone, defaulting to `"UTC"`), the active guide, up to 30 preferences, up to 100 examples, and the idea's existing drafts and pieces.
  - It picks 4 exemplars per target with `selectExemplars`, using the platform, or null for pieces, against the idea text.
  - `now` is `new Date().toISOString()`.
- **`agent/tools/draft_posts.ts`:**
  - It is `defineWorkflowTool` with `inputSchema: DRAFT_POSTS_INPUT` and this description: "Draft posts for X, LinkedIn and Threads, and optionally a reel script or carousel outline, from an idea in the owner's voice. Saves every draft for review in Studio. Never publishes. Pass ideaId for Studio requests; otherwise pass idea and any sources you fetched."
  - The `execute` body starts with `"use workflow"`. It calls `prepareDrafting(ctx, input)`, then `runDrafting`. The deps bind `brandId` and `userId` to the step functions.
  - `openWriter` returns a conversation that:
    - opens `const session = ctx.agent("writer")` once per conversation;
    - calls `session.send(message, { outputSchema: outputSchemaFor(target), signal: ctx.abortSignal })` and awaits `(await response).result()`;
    - maps `status === "failed"` to `{ ok: false, message: error?.message ?? "The writer failed." }`;
    - maps a missing `data` to `{ ok: false, message: "The writer stopped before finishing." }`.
  - If the `eve/tools` types accept `label` on `defineWorkflowTool`, add `label.start` returning `Drafting ${platform labels joined by ", "}`. Otherwise leave it out.

- [ ] **Step 1: Write `lib/drafts/orchestrate.test.ts`** with in-memory fakes for `DraftingDeps`, using a scripted `WriterConversation` that returns queued replies.

```ts
const post = (platform: string, posts: string[], extra = {}) => ({ ok: true, data: { platform, hook: "h", posts, imagePrompt: null, suggestedTime: null, notes: "", ...extra } });

it("drafts every target in parallel and returns them in platform order", async () => {
  const deps = fakeDeps({ replies: { x: [post("x", ["Ship small."])], linkedin: [post("linkedin", ["Long form."])], threads: [post("threads", ["Chatty."])] } });
  const result = await runDrafting(deps, plan({ targets: ["x", "linkedin", "threads"] }));
  expect(result).toMatchObject({ ok: true, failed: [], skipped: [] });
  expect(result.ok && result.drafts.map((d) => d.platform)).toEqual(["x", "linkedin", "threads"]);
  expect(deps.saved.map((s) => s.mode)).toEqual(["create", "create", "create"]);
});
it("asks for one repair when lint finds errors, and only one", async () => {
  const deps = fakeDeps({ replies: { x: [post("x", ["a".repeat(300)]), post("x", ["b".repeat(300)])] } });
  const result = await runDrafting(deps, plan({ targets: ["x"] }));
  expect(deps.asked.x).toHaveLength(2);
  expect(deps.asked.x[1]).toContain("280");
  expect(result.ok && result.drafts[0]!.issues.length).toBeGreaterThan(0); // saved with warnings
});
it("reports one failed target and keeps the others", async () => {
  const deps = fakeDeps({ replies: { x: [{ ok: false, message: "boom" }], threads: [post("threads", ["ok"])] } });
  const result = await runDrafting(deps, plan({ targets: ["x", "threads"] }));
  expect(result).toMatchObject({ ok: true, failed: [{ target: "post:x", message: "boom" }] });
  expect(result.ok && result.drafts.map((d) => d.platform)).toEqual(["threads"]);
});
it("fails a target whose posts are all blank", async () => {
  const deps = fakeDeps({ replies: { x: [post("x", ["  "])] } });
  expect(await runDrafting(deps, plan({ targets: ["x"] }))).toMatchObject({ failed: [{ target: "post:x" }] });
});
it("skips targets that already exist unless redrafting", async () => {
  const deps = fakeDeps({ replies: {} });
  const result = await runDrafting(deps, plan({ targets: ["x"], existing: { x: { draftId: "d1", revision: 2 } } }));
  expect(result).toMatchObject({ skipped: [{ target: "post:x", reason: "already_drafted" }] });
  expect(deps.asked.x ?? []).toHaveLength(0);
});
it("redrafts an existing draft as a new revision", async () => {
  const deps = fakeDeps({ replies: { x: [post("x", ["New."])] } });
  await runDrafting(deps, plan({ targets: ["x"], existing: { x: { draftId: "d1", revision: 2 } }, redraft: true }));
  expect(deps.saved[0]!.mode).toEqual({ expectedRevision: 2 });
});
it("drops a bad suggested time and keeps a good one", async () => {
  const deps = fakeDeps({ replies: { x: [post("x", ["a"], { suggestedTime: "2020-01-01T00:00:00Z" })], threads: [post("threads", ["b"], { suggestedTime: "2026-10-25T09:00:00Z" })] } });
  await runDrafting(deps, plan({ targets: ["x", "threads"], now: "2026-10-24T10:00:00Z" }));
  expect(deps.saved.map((s) => s.scheduledAt)).toEqual([null, "2026-10-25T09:00:00.000Z"]);
});
it("saves the draft even when its image fails", async () => {
  const deps = fakeDeps({ replies: { x: [post("x", ["a"], { imagePrompt: "a desk" })] }, imageFails: true });
  const result = await runDrafting(deps, plan({ targets: ["x"] }));
  expect(result).toMatchObject({ ok: true, failed: [], drafts: [{ platform: "x", imageUrl: null, imageError: expect.any(String) }] });
});
it("saves a carousel and generates its cover", async () => {
  const deps = fakeDeps({ replies: { carousel_outline: [{ ok: true, data: { title: "T", slides: [{ heading: "a", body: "b" }, { heading: "c", body: "d" }, { heading: "e", body: "f" }], coverImagePrompt: "cover", caption: "c", notes: "" } }] } });
  const result = await runDrafting(deps, plan({ targets: ["carousel_outline"] }));
  expect(result).toMatchObject({ ok: true, pieces: [{ kind: "carousel_outline", imageUrl: expect.any(String) }] });
});
```

  `fakeDeps` and `plan` are local helpers. `plan` builds a `DraftingPlan` from short target names.
- [ ] **Step 2: Write `lib/drafts/input.test.ts`.**
  - `resolveTargets({}, null)` gives the three platforms.
  - `resolveTargets({ pieces: ["reel_script"] }, null)` gives only the reel.
  - The idea's `requested` set is used when the input has neither list.
  - Duplicates are removed.
  - `DRAFT_POSTS_INPUT` rejects an `idea` of 8,001 characters and 4 sources.
  - `ideaSourceChannel({ channel: "whatsapp" })` is `"whatsapp"`, and an unknown channel gives `"web"`.
- [ ] **Step 3: Write `lib/media/generate.test.ts`.** Mock `@/lib/rate-limit`, `@/lib/image-gen` and `@/lib/media/assets`.
  - A `RateLimitError` returns the "Image limit reached for today (50)" message.
  - Success returns `{ ok: true, mediaId, url }` from `saveMediaAsset`.
- [ ] **Step 4: Run them.** Run `pnpm vitest run lib/drafts lib/media/generate`. Expected: FAIL.
- [ ] **Step 5: Implement `limits.ts`, `input.ts`, `orchestrate.ts`, `steps.ts` and `generate.ts`.** Then switch `generate_image` to `generateBrandImage`, keeping its existing output shape.
- [ ] **Step 6: Create `agent/tools/draft_posts.ts`** as specified.
- [ ] **Step 7: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm eve:build`.
  - Expected: all pass, and `eve build` lists the `draft_posts` workflow tool.
  - If the build rejects an import inside the workflow body, move it into `lib/drafts/steps.ts`. The body may import only `orchestrate.ts`, `writer.ts`, `input.ts`, the step functions and types.
- [ ] **Step 8: Commit.**

```bash
git add lib/drafts lib/media/generate.ts lib/media/generate.test.ts agent/tools/generate_image.ts agent/tools/draft_posts.ts
git commit -m "feat(agent): draft_posts workflow drafts every platform in parallel through the writer"
```

---

### Task 7: Revisions, proposed times and draft reads

**Files:**
- Modify: `lib/drafts/orchestrate.ts` (add `runRevision`), `lib/drafts/steps.ts` (add the revision steps)
- Create: `lib/drafts/schedule.ts`
- Create in `agent/tools/`:
  - `revise_draft.ts`
  - `propose_schedule.ts`
  - `list_drafts.ts`
- Test: `lib/drafts/orchestrate.test.ts` (extend), `lib/drafts/schedule.test.ts`

**Interfaces:**
- Consumes: Task 4 `completeRevision`, `clearRevisionRequest`, `setProposedTime`, `getDraft`, `listDrafts`, `getIdea`; Task 6 `writeTarget` and the steps.
- Produces:
  ```ts
  // lib/drafts/schedule.ts
  export const PROPOSED_TIME_MAX_DAYS = 60;
  export function normalizeProposedTime(value: string, now: Date): { readonly ok: true; readonly iso: string } | { readonly ok: false; readonly message: string };
  //   future (>= now + 5 minutes), <= now + 60 days, parseable; messages: "Pick a time in the future.", "Pick a time within 60 days.", "I couldn't read that time."
  // lib/drafts/orchestrate.ts
  export type RevisionPlan = { readonly draftId: string; readonly revision: number; readonly brief: WriterBrief; readonly currentPosts: readonly string[]; readonly instruction: string; readonly regenerateImage: boolean; readonly existingImagePrompt: string | null };
  export interface RevisionDeps {
    openWriter(): WriterConversation;
    complete(input: { readonly hook: string; readonly posts: readonly string[]; readonly imagePrompt: string | null }): Promise<ReviewResult>;
    abandon(): Promise<void>; // clearRevisionRequest
    generateImage: DraftingDeps["generateImage"];
    attachDraftImage: DraftingDeps["attachDraftImage"];
  }
  export type ReviseDraftResult = { readonly ok: true; readonly draft: DraftSummary } | { readonly ok: false; readonly message: string };
  export function runRevision(deps: RevisionDeps, plan: RevisionPlan): Promise<ReviseDraftResult>;
  // lib/drafts/steps.ts
  export function prepareRevision(ctx: WorkflowStepToolContext, input: { readonly draftId: string; readonly instruction: string; readonly regenerateImage?: boolean }):
    Promise<{ readonly ok: true; readonly plan: RevisionPlan; readonly brandId: string; readonly userId: string } | { readonly ok: false; readonly message: string }>;
  export function completeRevisionStep(input: Parameters<typeof completeRevision>[0]): Promise<ReviewResult>;
  export function abandonRevisionStep(input: { readonly brandId: string; readonly draftId: string }): Promise<void>;
  ```
- Rules:
  - **`prepareRevision`:**
    - It requires a brand context, then applies the `REVISIONS_PER_HOUR` limit (`"draft:revise"`).
    - The draft must exist for the brand, otherwise "That draft is gone." Its status must allow `edit`, otherwise "That draft can't be changed now."
    - It builds the brief exactly as `prepareDrafting` does for that platform.
    - The plan's `revision` is the draft's current revision.
  - **`runRevision`:**
    - It calls `writeTarget` with `{ kind: "revise", currentPosts, instruction }`.
    - On failure, it calls `abandon()` and returns `{ ok: false, message }`.
    - On success, it calls `complete`. A `stale` result returns "That draft changed while harpy was writing. Try again on the latest version." and calls `abandon()`.
    - When `regenerateImage` is set and the output has an `imagePrompt`, it generates and attaches a new image. Otherwise the existing media stays.
  - **`revise_draft`** is `defineWorkflowTool`, input `{ draftId: string, instruction: string (1..2000), regenerateImage?: boolean }`. Description: "Rewrite one saved draft following the owner's requested change. Creates a new revision for review. Never publishes."
  - **`propose_schedule`** is `defineTool`, input `{ draftId: string, scheduledAt: string }`. Description: "Suggest a posting time for a draft that is waiting for review. The owner still has to approve it. Use ISO 8601 with an offset." It uses `normalizeProposedTime` and `setProposedTime`. A failure returns `{ ok: false, message }`, using `reviewFailureMessage` for review failures.
  - **`list_drafts`** is `defineTool`, input `{ status?: enum(DRAFT_STATES), limit?: int 1..20 (default 10) }`. It returns summaries of `{ draftId, platform, status, revision, firstLine, scheduledAt }`.
  - All three resolve the brand with `resolveBrandContext`, and return `{ ok: false, message: "You need to be signed in to ..." }` without one.

- [ ] **Step 1: Write `lib/drafts/schedule.test.ts`.** Cover:
  - accepts 2 days out;
  - rejects 3 minutes out with "Pick a time in the future.";
  - rejects 61 days out with "Pick a time within 60 days.";
  - rejects "next Tuesday" with "I couldn't read that time.".
- [ ] **Step 2: Extend `orchestrate.test.ts` for `runRevision`:**
  - Success calls `complete` once with the normalized posts, and `abandon` zero times.
  - A writer failure calls `abandon` once and returns `{ ok: false }`.
  - A `stale` result from `complete` calls `abandon` and returns the stale message.
  - `regenerateImage: false` never calls `generateImage`.
- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/drafts`. Expected: FAIL.
- [ ] **Step 4: Implement** `schedule.ts`, `runRevision`, the steps and the three tools.
- [ ] **Step 5: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm eve:build`. Expected: all pass.
- [ ] **Step 6: Commit.**

```bash
git add lib/drafts agent/tools/revise_draft.ts agent/tools/propose_schedule.ts agent/tools/list_drafts.ts
git commit -m "feat(agent): revise_draft, propose_schedule and list_drafts"
```

---

### Task 8: Brand voice in the agent, instructions and Studio requests

**Files:**
- Create: `lib/redis.ts`
- Modify: `lib/rate-limit.ts` (use `getRedis()`; behavior unchanged)
- Create in `lib/voice/`:
  - `recall-cache.ts`
  - `memory.ts`
  - `instruction.ts`
- Create: `agent/memory/voice.ts`, `agent/instructions/brand-voice.ts`
- Create: `agent/tools/update_voice_guide.ts`, `agent/tools/list_voice_examples.ts`
- Create: `lib/studio/requests.ts`
- Modify: `agent/instructions.md`
- Test:
  - `lib/voice/memory.test.ts`
  - `lib/voice/recall-cache.test.ts`
  - `lib/voice/instruction.test.ts`
  - `lib/studio/requests.test.ts`

**Interfaces:**
- Consumes: Task 3 store and exemplars; the Upstash env that `lib/rate-limit.ts` reads today.
- Produces:
  ```ts
  // lib/redis.ts
  export function getRedis(): Redis | null; // @upstash/redis from UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN; null when absent
  // lib/voice/recall-cache.ts
  export const RECALL_CACHE_TTL_SECONDS = 604_800;
  export function withRecallCache<T>(operationId: string, compute: () => Promise<T>, redis?: Redis | null): Promise<T>; // key `voice:recall:${operationId}`
  // lib/voice/memory.ts
  export function extractTurnText(input: unknown): string; // text parts of turn.input messages joined by "\n"; "" for anything else
  export function buildVoiceRecall(input: { readonly preferences: readonly VoicePreference[]; readonly exemplars: readonly VoiceExample[] }): { readonly messages: readonly { readonly id: string; readonly content: string }[] };
  //   ids "preference:<id>" content "Owner preference: <text>"; "example:<id>" content "An example of the owner's past <Platform or 'post'> writing:\n<text>"
  export function voiceMemoryProvider(): ReturnType<typeof defineMemoryProvider>;
  // lib/voice/instruction.ts
  export function formatVoiceGuideInstruction(guide: VoiceGuide): string; // "# Brand voice guide (version N)\n\n<body>\n\nWrite everything for the owner in this voice."
  // lib/studio/requests.ts
  export const STUDIO_REQUEST_PREFIX = "Studio request:";
  export function buildDraftIdeaRequest(input: { readonly ideaId: string; readonly ideaText: string }): string;
  export function buildRevisionRequest(input: { readonly draftId: string; readonly platform: SocialPlatform; readonly instruction: string }): string;
  export function buildRewriteGuideRequest(): string;
  export function extractLinks(text: string): string[]; // http(s) urls, deduped, max 3
  ```
- **The memory provider:**
  - `recall["turn.started"]` reads `brandId` from `ctx.memory.scope.value[0]`. Inside `withRecallCache(ctx.operationId, ...)` it:
    - loads up to 30 preferences;
    - loads up to 100 examples;
    - selects 3 exemplars for `extractTurnText(ctx.turn.input)` with platform null;
    - returns `buildVoiceRecall(...)`.
  - It returns `null` when there is no brand id.
  - `tools(ctx)` returns `{ note_preference: defineTool({...}) }`:
    - Input: `{ text: z.string().min(3).max(300) }`.
    - Description: "Save a lasting writing preference the owner states, such as 'never use hashtags on LinkedIn'. Only for preferences the owner says should always apply."
    - It calls `addVoicePreference({ source: "chat" })` and returns `{ ok: true, saved: text }`.
  - The model sees it as `voice__note_preference`.
- **The memory slot.** `agent/memory/voice.ts` is:
  ```ts
  defineMemory({
    description: "The owner's brand voice: stated preferences and example posts.",
    provider: voiceMemoryProvider(),
    scope(ctx) { const id = ctx.session.auth.current?.attributes.brandId; return typeof id === "string" && id ? [id] : null; },
  })
  ```
- **The dynamic instruction.** `agent/instructions/brand-voice.ts` is `defineDynamic({ events: { "turn.started": ... } })`:
  - it reads `brandId` from `ctx.session.auth.current?.attributes`;
  - returns `defineInstructions({ content: formatVoiceGuideInstruction(await getActiveVoiceGuide(brandId)) })`;
  - and returns `null` when there is no brand or the load throws (catch it and `console.warn`).
- **The voice tools:**
  - `update_voice_guide`:
    - input `{ body: string (50..12000), note: string (max 200) }`;
    - calls `saveVoiceGuideVersion({ source: "harpy", basedOnVersion: (await getActiveVoiceGuide(brandId)).version })`;
    - description: "Save a new version of the owner's brand voice guide. Use only when the owner asks you to rewrite or update their guide."
  - `list_voice_examples`: input `{ limit?: int 1..30 (default 20) }`; returns `{ platform, text }[]`.
- **The request builders.** Each starts with `STUDIO_REQUEST_PREFIX`.
  - `buildDraftIdeaRequest` says, as plain sentences:
    - "Draft idea <ideaId>."
    - "Call draft_posts with ideaId "<ideaId>"; the idea's text and requested platforms are saved with it."
    - When `extractLinks(ideaText)` is non-empty: "First read these links with web_fetch and pass each article's text as a source: <urls>."
    - "Do not write the drafts yourself. When the tool finishes, reply with one short line."
  - `buildRevisionRequest` asks for `revise_draft` with the draftId, and quotes the instruction between `<change>` and `</change>`.
  - `buildRewriteGuideRequest` asks to call `list_voice_examples`, write a new guide that keeps the default anti-AI rules, and save it with `update_voice_guide`.
- **`agent/instructions.md`** keeps the existing headings, with these changes:
  - "What works today" lists drafting (`draft_posts`, `revise_draft`, `propose_schedule`, `list_drafts`), brand voice (`update_voice_guide`, `list_voice_examples`, `voice__note_preference`), images, custom skills and MCP connections.
  - Add a `# Drafting` section:
    - drafts are always saved through tools and never pasted as the only copy;
    - after `draft_posts`, reply with one line per draft, giving the platform and the opening line, and say they're waiting in Studio;
    - read links with `web_fetch` and pass their text as `sources`;
    - keep links out of X posts unless the owner asks, because a link costs $0.20;
    - use `voice__note_preference` only for lasting preferences the owner states.
  - Add a `# Studio requests` section: a message starting with "Studio request:" comes from the Studio page. Do exactly the tool calls it names, then reply in one short line.
  - Keep "Never say anything was posted or scheduled." and change the reason to "Publishing arrives in a later stage; approved drafts wait in Studio."

- [ ] **Step 1: Write the tests.**

```ts
// lib/studio/requests.test.ts
it("asks for draft_posts with the idea id and fetches links first", () => {
  const message = buildDraftIdeaRequest({ ideaId: "i1", ideaText: "Read https://a.co/x and https://a.co/x then post" });
  expect(message.startsWith("Studio request:")).toBe(true);
  expect(message).toContain('ideaId "i1"');
  expect(message).toContain("web_fetch");
  expect(message.match(/https:\/\/a\.co\/x/g)).toHaveLength(1);
});
it("leaves out web_fetch when there are no links", () => expect(buildDraftIdeaRequest({ ideaId: "i1", ideaText: "No links" })).not.toContain("web_fetch"));
it("fences the requested change", () => expect(buildRevisionRequest({ draftId: "d1", platform: "x", instruction: "shorter" })).toContain("<change>shorter</change>"));
it("caps links at 3", () => expect(extractLinks("https://a.co/1 https://a.co/2 https://a.co/3 https://a.co/4")).toHaveLength(3));
```

  Also write:
  - **`lib/voice/memory.test.ts`:**
    - `buildVoiceRecall` produces stable ids and the content prefixes above;
    - `extractTurnText([{ role: "user", content: [{ type: "text", text: "a" }, { type: "file" }] }, { role: "user", content: "b" }])` is `"a\nb"`;
    - `extractTurnText(42)` is `""`.
  - **`lib/voice/recall-cache.test.ts`**, with a fake redis (`get` and `set`):
    - a miss computes once and calls `set` with `{ ex: 604800 }`;
    - a hit returns the cached value without computing;
    - `redis: null` computes without caching.
  - **`lib/voice/instruction.test.ts`:** the heading carries the version number, and the body is included verbatim.
- [ ] **Step 2: Run them.** Run `pnpm vitest run lib/voice lib/studio`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/redis.ts` and the `rate-limit` refactor (`pnpm vitest run lib/rate-limit` still passes, if it has tests), the three voice modules, `requests.ts`, the two agent files, the two tools and the instruction edits.
- [ ] **Step 4: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm eve:build`.
  - Expected: all pass. `eve build` lists the memory slot `voice`, the dynamic instructions entry and the new tools.
- [ ] **Step 5: Commit.**

```bash
git add lib/redis.ts lib/rate-limit.ts lib/voice lib/studio agent/memory agent/instructions agent/instructions.md agent/tools/update_voice_guide.ts agent/tools/list_voice_examples.ts
git commit -m "feat(agent): brand voice memory, live voice guide, voice tools and Studio request protocol"
```

---

### Task 9: Studio data, actions, view model and keyboard

**Files:**
- Create: `lib/studio/types.ts`, `lib/studio/snapshot.ts`, `lib/studio/view-model.ts`, `lib/studio/keyboard.ts`, `lib/studio/start-run.ts`
- Create: `app/api/studio/route.ts`, `app/actions/studio.ts`
- Test: `lib/studio/snapshot.test.ts`, `lib/studio/view-model.test.ts`, `lib/studio/keyboard.test.ts`

**Interfaces:**
- Consumes: Task 4 store, records and review; Task 8 request builders; Task 2 lint; Task 3 `getBrandSettings`, `setBrandTimezone` and `isValidTimeZone`.
- Produces:
  ```ts
  // lib/studio/types.ts
  export type StudioDraft = DraftRecord & { readonly imageUrl: string | null };
  export type StudioPiece = ContentPieceRecord & { readonly imageUrl: string | null };
  export type StudioIdea = IdeaRecord & { readonly drafts: readonly StudioDraft[]; readonly pieces: readonly StudioPiece[] };
  export type StudioSnapshot = { readonly timezone: string; readonly now: string; readonly ideas: readonly StudioIdea[]; readonly upNext: readonly StudioDraft[] };
  // lib/studio/snapshot.ts
  export const STUDIO_IDEA_LIMIT = 30;
  export const UP_NEXT_LIMIT = 8;
  export function loadStudioSnapshot(brandId: string): Promise<StudioSnapshot>;
  //   ideas: newest 30 with source_channel <> 'eval'; their drafts (x, linkedin, threads order) and pieces;
  //   imageUrl: blob_url of the first media id (brand-scoped media_asset); upNext: status 'approved', order scheduled_at asc nulls last, then approved_at asc, limit 8
  // lib/studio/view-model.ts
  export const DRAFTING_STALE_MS = 600_000;
  export type IdeaPhase = "drafting" | "ready" | "stalled";
  export function missingTargets(idea: StudioIdea): DraftTarget[];
  export function ideaPhase(idea: StudioIdea, now: Date): IdeaPhase;
  export function isRevising(draft: StudioDraft, now: Date): boolean;
  export function needsPolling(snapshot: StudioSnapshot, now: Date): boolean;
  export function formatLocalTime(iso: string, timezone: string): string; // "Tue 9:30 AM"
  export function draftMeta(draft: StudioDraft, timezone: string): string;
  export function draftWarnings(draft: StudioDraft): string[]; // lintPost messages; allowLinks true except X
  export function ideaSourceLabel(idea: StudioIdea, now: Date): string;
  //   studio "via Studio", web "via chat", whatsapp "via WhatsApp", slack "via Slack", schedule "via brief", then " · " and a relative age
  //   ("just now" under a minute, "N min ago" under an hour, "N h ago" under a day, else "Oct 24")
  export function selectableDraftIds(snapshot: StudioSnapshot): string[]; // drafts of every idea in display order
  // lib/studio/keyboard.ts
  export type StudioKeyAction = { readonly type: "move"; readonly delta: 1 | -1 } | { readonly type: "approve" | "edit" | "skip" | "help" };
  export function keyToAction(event: { readonly key: string; readonly metaKey: boolean; readonly ctrlKey: boolean; readonly altKey: boolean; readonly target: { readonly tagName?: string; readonly isContentEditable?: boolean } | null }): StudioKeyAction | null;
  export function moveSelection(ids: readonly string[], current: string | null, delta: 1 | -1): string | null;
  // lib/studio/start-run.ts (browser only)
  export function startHarpyRun(message: string): Promise<{ readonly sessionId: string }>;
  //   new Client({ host: window.location.origin, redirect: "error" }).sessions.create({ message }); returns { sessionId: response.sessionId }; never awaits result()
  // app/actions/studio.ts ("use server")
  export type StudioActionResult = { readonly ok: true; readonly draft: StudioDraft } | { readonly ok: false; readonly message: string; readonly draft: StudioDraft | null };
  export function createIdeaAction(input: { text: string; platforms: SocialPlatform[]; pieces: PieceKind[] }): Promise<{ ok: true; ideaId: string; message: string } | { ok: false; message: string }>;
  export function retryIdeaAction(input: { ideaId: string }): Promise<{ ok: true; message: string } | { ok: false; message: string }>;
  export function approveDraftAction(input: { draftId: string; expectedRevision: number }): Promise<StudioActionResult>;
  export function skipDraftAction(input: { draftId: string; expectedRevision: number }): Promise<StudioActionResult>;
  export function restoreDraftAction(input: { draftId: string }): Promise<StudioActionResult>;
  export function saveDraftEditAction(input: { draftId: string; expectedRevision: number; text: string }): Promise<StudioActionResult>; // editTextToPosts(text)
  export function requestDraftRevisionAction(input: { draftId: string; expectedRevision: number; instruction: string }): Promise<{ ok: true; message: string } | { ok: false; message: string }>;
  export function setBrandTimezoneAction(input: { timezone: string }): Promise<{ ok: boolean; message?: string }>;
  ```
- Rules:
  - **`ideaPhase`:**
    - `"ready"` when `missingTargets` is empty;
    - `"drafting"` when targets are missing and `draftRequestedAt` is within `DRAFTING_STALE_MS` of `now`;
    - `"stalled"` otherwise.
  - **`missingTargets`:** the requested targets that have no draft or piece.
  - **`isRevising`:** `revisionRequestedAt` is within `DRAFTING_STALE_MS` of `now`.
  - **`needsPolling`:** any idea is `drafting`, or any draft `isRevising`.
  - **`draftMeta`:**
    - starts with `<Platform label> · <N> chars` for one post, or `<Platform label> · <N> posts` for a thread;
    - adds ` · <formatLocalTime(scheduledAt)>` when there is a time;
    - adds ` · includes a link · $0.20` when an X draft `containsLink`.

    The label comes from `PLATFORMS`. Chars are counted with `countPostChars`.
  - **`formatLocalTime`:** `Intl.DateTimeFormat("en-US", { weekday: "short", hour: "numeric", minute: "2-digit", timeZone })`, with the comma removed: `"Tue 9:30 AM"`.
  - **`keyToAction`** returns `null` in these cases:
    - any of `metaKey`, `ctrlKey` or `altKey` is set;
    - `target.tagName` is `INPUT`, `TEXTAREA` or `SELECT`;
    - `target.isContentEditable`.

    Otherwise it maps:
    - `j`/`J` to move +1 and `k`/`K` to move -1;
    - `a` to approve, `e` to edit, `s` to skip;
    - `?` to help.
  - **`moveSelection`:**
    - with no current id, +1 gives the first and -1 gives the last;
    - it clamps at both ends, with no wrap;
    - an empty list gives null.
  - **The actions:**
    - Each one starts with `getServerViewer()`. Without a viewer it returns `{ ok: false, message: "Sign in with Vercel to continue." }`.
    - Inputs are parsed with zod. `text` is `1..IDEA_MAX_CHARS`, and at least one platform or piece is required ("Pick at least one platform."). `instruction` is `1..2000`.
    - The brand comes from `getBrandIdForUser(viewer)`.
    - The review actions map `ReviewResult` with `reviewFailureMessage`, and attach `imageUrl` by reading the media row.
    - `createIdeaAction` calls `createIdea` with `sourceKind: "link"` when `extractLinks(text)` is non-empty, else `"text"`, and `sourceChannel: "studio"`. It returns `buildDraftIdeaRequest`.
    - `retryIdeaAction` calls `markIdeaRequested`, then returns `buildDraftIdeaRequest` again. `draft_posts` skips the targets that already exist, so only the missing ones are drafted.
    - `requestDraftRevisionAction` calls `requestRevision` first, then returns `buildRevisionRequest`.
    - `setBrandTimezoneAction` checks `isValidTimeZone`.
  - **`GET /api/studio`** follows the pattern of `app/api/chats/[id]/route.ts`: a 503 when the app isn't ready, a 401 without a viewer, otherwise `NextResponse.json(await loadStudioSnapshot(brandId), { headers: { "cache-control": "no-store" } })`.

- [ ] **Step 1: Write the tests.**

```ts
// lib/studio/keyboard.test.ts
const key = (k: string, extra: Partial<Parameters<typeof keyToAction>[0]> = {}) =>
  keyToAction({ key: k, metaKey: false, ctrlKey: false, altKey: false, target: { tagName: "DIV" }, ...extra });
it.each([["j", { type: "move", delta: 1 }], ["K", { type: "move", delta: -1 }], ["a", { type: "approve" }], ["e", { type: "edit" }], ["s", { type: "skip" }], ["?", { type: "help" }]] as const)(
  "%s maps", (k, action) => expect(key(k)).toEqual(action));
it.each(["INPUT", "TEXTAREA", "SELECT"])("ignores keys typed in %s", (tagName) => expect(key("a", { target: { tagName } })).toBeNull());
it("ignores contentEditable and modifiers", () => {
  expect(key("a", { target: { isContentEditable: true } })).toBeNull();
  expect(key("s", { metaKey: true })).toBeNull();
  expect(key("j", { ctrlKey: true })).toBeNull();
});
it("moves and clamps", () => {
  expect(moveSelection(["a", "b"], null, 1)).toBe("a");
  expect(moveSelection(["a", "b"], null, -1)).toBe("b");
  expect(moveSelection(["a", "b"], "b", 1)).toBe("b");
  expect(moveSelection([], null, 1)).toBeNull();
});
```

```ts
// lib/studio/view-model.test.ts
const now = new Date("2026-10-24T10:00:00Z");
it("is drafting for 10 minutes, then stalled", () => {
  const idea = studioIdea({ requested: { platforms: ["x", "linkedin"], pieces: [] }, drafts: [studioDraft({ platform: "x" })] });
  expect(ideaPhase({ ...idea, draftRequestedAt: "2026-10-24T09:55:00Z" }, now)).toBe("drafting");
  expect(ideaPhase({ ...idea, draftRequestedAt: "2026-10-24T09:49:00Z" }, now)).toBe("stalled");
  expect(missingTargets(idea)).toEqual([{ kind: "post", platform: "linkedin" }]);
});
it("is ready when every requested target exists", () =>
  expect(ideaPhase(studioIdea({ requested: { platforms: ["x"], pieces: [] }, drafts: [studioDraft({ platform: "x" })] }), now)).toBe("ready"));
it("formats in the brand's zone", () => expect(formatLocalTime("2026-10-27T04:00:00Z", "Asia/Kolkata")).toBe("Tue 9:30 AM"));
it("builds the meta line with the X link cost", () =>
  expect(draftMeta(studioDraft({ platform: "x", posts: ["read https://a.co"], text: "read https://a.co", scheduledAt: "2026-10-27T04:00:00Z" }), "Asia/Kolkata"))
    .toBe("X · 28 chars · Tue 9:30 AM · includes a link · $0.20"));
it("counts thread posts", () => expect(draftMeta(studioDraft({ platform: "x", posts: ["a", "b", "c"] }), "UTC")).toBe("X · 3 posts"));
it("polls while drafting or revising, not otherwise", () => {
  expect(needsPolling(snapshot({ ideas: [studioIdea({ draftRequestedAt: "2026-10-24T09:59:00Z", requested: { platforms: ["x"], pieces: [] } })] }), now)).toBe(true);
  expect(needsPolling(snapshot({ ideas: [] }), now)).toBe(false);
});
```

  `lib/studio/snapshot.test.ts` mocks the db and checks:
  - the idea query excludes `source_channel = 'eval'`;
  - every query filters on `brand_id`;
  - `upNext` orders `scheduled_at asc nulls last`;
  - an idea's drafts come back in x, linkedin, threads order.
- [ ] **Step 2: Run them.** Run `pnpm vitest run lib/studio`. Expected: FAIL.
- [ ] **Step 3: Implement** the lib modules, the route and the actions.
- [ ] **Step 4: Run the checks.** Run `pnpm vitest run lib/studio` and `pnpm typecheck`. Expected: PASS, no errors.
- [ ] **Step 5: Commit.**

```bash
git add lib/studio app/api/studio app/actions/studio.ts
git commit -m "feat(studio): snapshot route, review actions, view model and keyboard map"
```

---

### Task 10: Studio UI

**Files:**
- Modify: `lib/draft-status.ts` and `lib/draft-status.test.ts`
  - add `approved`: label "Approved", `--status-scheduled`, glyph `"dot"`;
  - add `skipped`: label "Skipped", `--status-draft`, glyph `"slash"`.
- Modify: `components/harpy/status-glyph.tsx`
  - `dot`: the circle plus `<circle cx="6" cy="6" r="1.75" fill="currentColor" stroke="none" />`;
  - `slash`: the circle plus `<path d="M3.5 8.5l5-5" />`;
  - add the `STATUS_TEXT_CLASS` entries.
- Modify: `lib/drafts/state.ts` (narrow `toDisplayStatus` to `DraftStatus`)
- Modify: `components/harpy/draft-card.tsx`. New optional props:
  - `warnings?: readonly string[]`;
  - `notice?: string`;
  - `workingLabel?: string` (default "harpy is refining");
  - `onRestore?: () => void`, which renders a ghost "Restore" button;
  - `children?: ReactNode`, which replaces the text and image area when present (the edit mode).
- Test: `components/harpy/draft-card.test.ts`
- Modify: `app/(app)/page.tsx` (render `<StudioView />`)
- Create in `app/(app)/_components/studio/`:
  - `studio-view.tsx`
  - `idea-composer.tsx`
  - `idea-item.tsx`
  - `studio-draft.tsx`
  - `draft-editor.tsx`
  - `content-piece-card.tsx`
  - `studio-rail.tsx`
  - `keyboard-help-dialog.tsx`
  - `use-studio-snapshot.ts`

**Interfaces:**
- Consumes: Task 9 actions, route, view model, keyboard and `startHarpyRun`; `IdeaBlock`, `DraftCard`, `PageHeader`, `EmptyState`, `WorkingIndicator`, `TimelineItem`, `KbdHint`, `showRequestError`; and the shadcn primitives `ToggleGroup`, `Dialog`, `Card`, `Button`, `Input` and `Label`.
- Produces:
  - `useStudioSnapshot(): { snapshot: StudioSnapshot | null; error: string | null; refresh(): Promise<void> }`.
    - It fetches `/api/studio` with `cache: "no-store"` on mount, on window focus and after every action.
    - It polls every 4,000 ms while `needsPolling` is true.
- **Behavior:**
  - **`StudioView`** (`"use client"`):
    - `PageHeader` "Studio" with `KbdHint keys={["?"]}` in `actions`;
    - a two-column grid, with `IdeaComposer` and the idea list in the first column and `StudioRail` in the second;
    - an empty state when there are no ideas: title "Your drafts will live here", description "Type an idea above. harpy drafts it for X, LinkedIn and Threads.";
    - when `snapshot.timezone === "UTC"` and the browser zone (`Intl.DateTimeFormat().resolvedOptions().timeZone`) differs, a one-line notice "Times show in UTC." with a button "Use <zone>" that calls `setBrandTimezoneAction`;
    - a `keydown` listener on `window` that uses `keyToAction`, moves the selection across `selectableDraftIds`, scrolls the selected card into view (`block: "nearest"`), runs the action on the selected draft, and opens `KeyboardHelpDialog` on `?`.
  - **`IdeaComposer`:**
    - a `textarea`, aria-label "Idea", with the placeholder "Drop an idea, a link or a rough note";
    - a `ToggleGroup type="multiple"` with X, LinkedIn and Threads on by default, and Reel script and Carousel off;
    - a submit button "Draft it", with `KbdHint keys={["Ctrl", "Enter"]}`. Ctrl or Cmd+Enter submits.
    - On submit: `createIdeaAction`, then `startHarpyRun(message)`, then clear the box and `refresh()`. Errors go to `showRequestError`.
    - If `startHarpyRun` throws after the idea was created, still `refresh()`. The idea then shows "stalled" with Try again after 10 minutes.
  - **`IdeaItem`:**
    - `IdeaBlock` with `ideaSourceLabel`;
    - `drafting`: `WorkingIndicator label="harpy is drafting"`;
    - `stalled`: the note "Some drafts didn't come back." and an outline button "Try again" (`retryIdeaAction`, then `startHarpyRun`);
    - then a `StudioDraft` for each draft and a `ContentPieceCard` for each piece.
  - **`StudioDraft`** wraps `DraftCard`:
    - `status={toDisplayStatus(draft.status)}`, `meta={draftMeta(...)}`, `warnings={draftWarnings(draft)}`;
    - `isWorking={isRevising(draft, now)}`, `isSelected`;
    - the actions depend on the state:

      | State | Actions | Notice |
      |---|---|---|
      | `pending_review` | Approve, Edit, Skip | none |
      | `approved` | Edit, Skip | "Approved. It waits here until publishing is set up." |
      | `skipped` | Restore | none |
      | other | none | none |

    - Every action calls its server action with `expectedRevision: draft.revision`. On `{ ok: false }` it shows `message` with `showRequestError` and `refresh()`es.
    - Edit replaces the card body with `DraftEditor`.
  - **`DraftEditor`:**
    - a textarea with `postsToEditText(draft.posts)`, and a hint line for threads: "Separate posts with a line that has only ---";
    - "Save", which calls `saveDraftEditAction`;
    - an input "Ask harpy for a change" with the button "Ask harpy", which calls `requestDraftRevisionAction` then `startHarpyRun`;
    - "Cancel";
    - Escape cancels.
  - **`ContentPieceCard`:**
    - a reel shows the title, hook, numbered beats (visual / voiceover / on-screen text) and the caption;
    - a carousel shows the cover image, numbered slides (heading and body) and the caption;
    - the chip reads "Reel script" or "Carousel".
  - **`StudioRail`:**
    - a "Morning brief" card: "Your daily brief arrives in a later stage.";
    - an "Up next" card with a `TimelineItem` per `upNext` draft, using the time `formatLocalTime(scheduledAt ?? approvedAt)` and `title` = the first line cut to 60 characters, or the empty line "Approved drafts show up here.".
  - **`KeyboardHelpDialog`:** lists J / K "Move between drafts", A "Approve", E "Edit", S "Skip" and ? "Show shortcuts".
- **Styling.** Use the type tokens (`text-body`, `text-small`, `text-meta`) and Tailwind spacing, with no arbitrary pixel values. Use existing components only, with no new colors.

- [ ] **Step 1: Update `lib/draft-status.test.ts`.** The expected summary gains `approved: ["Approved", "--status-scheduled", "dot"]` and `skipped: ["Skipped", "--status-draft", "slash"]`. Unique glyphs still hold.
- [ ] **Step 2: Write `components/harpy/draft-card.test.ts`.**

```ts
it("shows warnings and a notice", () => {
  const html = render({ warnings: ["X posts can be 280 characters."], notice: "Approved. It waits here until publishing is set up." });
  expect(html).toContain("X posts can be 280 characters.");
  expect(html).toContain("Approved. It waits here");
});
it("renders Restore only with onRestore", () => {
  expect(render({ onRestore: vi.fn() })).toContain(">Restore<");
  expect(render()).not.toContain(">Restore<");
});
it("replaces the text with children while editing", () => {
  const html = render({ text: "original", children: createElement("textarea", { defaultValue: "editing" }) });
  expect(html).not.toContain("original");
  expect(html).toContain("editing");
});
it("draws the new statuses", () => {
  expect(render({ status: "approved" })).toContain("Approved");
  expect(render({ status: "skipped" })).toContain("Skipped");
});
```

- [ ] **Step 3: Run them.** Run `pnpm vitest run lib/draft-status components/harpy`. Expected: FAIL.
- [ ] **Step 4: Implement** the status and glyph changes, the `DraftCard` props and the narrowed `toDisplayStatus`.
- [ ] **Step 5: Run them again.** Run `pnpm vitest run lib/draft-status components/harpy`. Expected: PASS. The `/design` showcase picks up the new statuses through `DRAFT_STATUS_META`. If it lists statuses by hand, add the two.
- [ ] **Step 6: Build the Studio components and the page** as specified.
- [ ] **Step 7: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Expected: all pass.
- [ ] **Step 8: Commit.**

```bash
git add lib/draft-status.ts lib/draft-status.test.ts lib/drafts/state.ts components/harpy "app/(app)/page.tsx" "app/(app)/_components/studio"
git commit -m "feat(studio): idea composer, draft review cards, editor, rail and keyboard shortcuts"
```

---

### Task 11: Brand voice page and time zone setting

**Files:**
- Create: `app/api/brand-voice/route.ts`, `app/actions/voice.ts`
- Modify: `app/(app)/brand-voice/page.tsx` (render `<BrandVoiceView />`)
- Create in `app/(app)/brand-voice/_components/`:
  - `brand-voice-view.tsx`
  - `guide-editor.tsx`
  - `examples-panel.tsx`
  - `preferences-panel.tsx`
- Modify: `app/(app)/settings/_components/settings-view.tsx` (add a "Time zone" row)
- Create: `lib/voice/view.ts`
- Test: `lib/voice/view.test.ts`

**Interfaces:**
- Consumes: Task 3 store, `splitPastedExamples` and `isValidTimeZone`; Task 8 `buildRewriteGuideRequest`; Task 9 `startHarpyRun` and `setBrandTimezoneAction`.
- Produces:
  ```ts
  // lib/voice/view.ts
  export type BrandVoiceSnapshot = { readonly guide: VoiceGuide; readonly versions: readonly VoiceGuide[]; readonly examples: readonly VoiceExample[]; readonly preferences: readonly VoicePreference[]; readonly timezone: string };
  export const REWRITE_MIN_EXAMPLES = 3;
  export function canRewriteGuide(snapshot: BrandVoiceSnapshot): boolean;
  export function versionLabel(guide: VoiceGuide): string; // "Version 3 · by harpy · Oct 24" ; sources: default "starter", manual "by you", harpy "by harpy", restore "restored"
  export function guideChangedSince(previous: number, snapshot: BrandVoiceSnapshot): boolean;
  // app/actions/voice.ts ("use server"), every action requires a viewer and resolves the brand like Task 9
  export function saveVoiceGuideAction(input: { body: string; basedOnVersion: number }): Promise<{ ok: true } | { ok: false; message: string }>; // stale -> "Your guide changed somewhere else. Reload to see it."
  export function restoreVoiceGuideAction(input: { version: number }): Promise<{ ok: true } | { ok: false; message: string }>;
  export function addVoiceExamplesAction(input: { platform: SocialPlatform | null; raw: string }): Promise<{ ok: true; added: number } | { ok: false; message: string }>; // 0 added -> "Paste at least one post of 20 characters or more."
  export function deleteVoiceExampleAction(input: { id: string }): Promise<{ ok: boolean }>;
  export function addVoicePreferenceAction(input: { text: string }): Promise<{ ok: true } | { ok: false; message: string }>;
  export function deleteVoicePreferenceAction(input: { id: string }): Promise<{ ok: boolean }>;
  export function requestGuideRewriteAction(): Promise<{ ok: true; message: string } | { ok: false; message: string }>; // < 3 examples -> "Add at least 3 example posts first."
  ```
- **Behavior:**
  - **`GET /api/brand-voice`** returns the `BrandVoiceSnapshot` (`no-store`), with the same guards as `/api/studio`.
  - **`BrandVoiceView`** (`"use client"`) has three Cards, in this order:
    1. **Guide:**
       - a textarea with the active body, and Save, which is disabled when unchanged;
       - "Rewrite from my examples", which is disabled when `!canRewriteGuide` and has the tooltip "Add at least 3 example posts first.".
         - Clicking it calls `requestGuideRewriteAction` and then `startHarpyRun`.
         - It shows `WorkingIndicator label="harpy is rewriting your guide"`, and polls every 5,000 ms for up to 5 minutes until `guideChangedSince(version)`.
       - Version history, using `versionLabel`. Each older version has a `ConfirmActionButton` "Restore", variant outline, with the confirm body "This saves version N as your newest guide.".
    2. **Example posts:**
       - a `ToggleGroup type="single"` for the platform (Any, X, LinkedIn, Threads);
       - a textarea with the placeholder "Paste past posts. Put a line with only --- between posts.";
       - "Add posts";
       - a list showing a platform chip, the first 3 lines, and a delete icon button with aria-label "Delete example".
    3. **Preferences:** an input with the placeholder "For example: never use hashtags on LinkedIn", "Add", and a list, each with a delete button. Chat-saved preferences show the meta text "from chat".
  - **Settings, "Time zone" row:** a native `select` of `Intl.supportedValuesOf("timeZone")` showing the current brand zone. A change calls `setBrandTimezoneAction` and shows a success toast "Time zone saved".

- [ ] **Step 1: Write `lib/voice/view.test.ts`.** Cover:
  - `canRewriteGuide` is false with 2 examples and true with 3;
  - `versionLabel` gives "Version 3 · by harpy · Oct 24" for a harpy version created 2026-10-24;
  - `guideChangedSince(3, snapshot with version 4)` is true, and is false for version 3.
- [ ] **Step 2: Run it.** Run `pnpm vitest run lib/voice/view`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/voice/view.ts`, the route, the actions, the page components and the settings row.
- [ ] **Step 4: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm build`. Expected: all pass.
- [ ] **Step 5: Commit.**

```bash
git add lib/voice/view.ts lib/voice/view.test.ts app/api/brand-voice app/actions/voice.ts "app/(app)/brand-voice" "app/(app)/settings/_components/settings-view.tsx"
git commit -m "feat(voice): Brand voice page with guide versions, examples and preferences; time zone setting"
```

---

### Task 12: Drafting evals and local eval sign-in

**Files:**
- Create: `lib/eval-auth.ts`
- Modify: `agent/channels/eve.ts` (auth order `[betterAuthEveAuth, evalOwnerAuth, vercelOidc(), localDev()]`)
- Create: `evals/evals.config.ts`, `evals/data/ideas.yaml`, `evals/drafting/ideas.eval.ts`, `evals/drafting/shared.ts`
- Modify: `package.json` (script `"evals": "eve eval"`), `.env.example` (`HARPY_EVAL_AS_OWNER`)
- Test: `lib/eval-auth.test.ts`

**Interfaces:**
- Consumes: Task 6 `DraftPostsResult`; Task 2 `lintPost`; `getOwnerEmail`, `findUserIdByEmail`, `getBrandIdForUser`; `localDev` from `eve/channels/auth`.
- Produces:
  ```ts
  // lib/eval-auth.ts
  export type EvalOwnerDeps = {
    readonly localDev: AuthFn<Request>;
    readonly findOwner: () => Promise<{ readonly id: string; readonly email: string } | null>;
    readonly brandFor: (user: { readonly id: string; readonly email: string }) => Promise<string>;
    readonly env: () => Readonly<Record<string, string | undefined>>;
  };
  export function createEvalOwnerAuth(deps: EvalOwnerDeps): AuthFn<Request>;
  export const evalOwnerAuth: AuthFn<Request>; // wired to localDev(), getOwnerEmail + findUserIdByEmail, getBrandIdForUser, () => process.env
  // evals/drafting/shared.ts
  export type EvalIdea = { readonly id: string; readonly idea: string; readonly platforms: readonly ("x" | "linkedin" | "threads")[]; readonly allowLinks?: boolean };
  export function draftRequestMessage(idea: EvalIdea): string; // "Draft posts for <platform labels> about this idea, using draft_posts: <idea>" (+ " Links are fine on X." when allowLinks)
  export function draftsFromToolCalls(toolCalls: readonly { readonly name: string; readonly output: unknown }[]): readonly { readonly platform: "x" | "linkedin" | "threads"; readonly posts: readonly string[]; readonly hook: string }[];
  export function hardIssues(draft: { readonly platform: "x" | "linkedin" | "threads"; readonly posts: readonly string[] }, allowLinks: boolean): string[]; // lintPost error messages
  ```
- **`createEvalOwnerAuth`:**
  - It returns `null` unless `env().NODE_ENV !== "production"` and `env().HARPY_EVAL_AS_OWNER === "1"`.
  - It returns `null` when `deps.localDev(request)` returns null.
  - Otherwise it looks up the owner. With no owner, it throws `ForbiddenError({ code: "owner_not_signed_in", message: "Sign in to harpy once as the owner before running evals." })`.
  - It returns the same principal shape as `betterAuthEveAuth`, with:
    - `authenticator: "harpy-eval"` and `issuer: "harpy-eval"`;
    - `principalType: "user"`, `principalId: owner.id`, `subject: owner.email`;
    - `attributes: { brandId, channel: "eval", email: owner.email, name: "eval" }`.
  - It never grants `allowToolStubs`, because the evals run the real tools.
- **The evals:**
  - **`evals.config.ts`:** `defineEvalConfig({ maxConcurrency: 3, timeoutMs: 300_000 })`.
  - **`ideas.yaml`:** 15 ideas, a mix of founder, engineering, career and product topics.
    - 3 of them include a link in the idea.
    - 1 has `allowLinks: true`.
    - 3 ask for a single platform.
    - The rest ask for all three.
  - **`ideas.eval.ts`** default-exports `rows.map((row) => defineEval({ description: row.id, async test(t) { ... } }))`. Each test:
    - runs `const turn = await t.send(draftRequestMessage(row))` and `t.succeeded()`;
    - asserts `t.calledTool("draft_posts", { count: (n) => n >= 1 })`;
    - sets `drafts = draftsFromToolCalls(turn.toolCalls)`;
    - checks `t.check(drafts.map((d) => d.platform).sort(), equals([...row.platforms].sort()))`;
    - for each draft, checks `t.check(hardIssues(draft, row.allowLinks ?? false), equals([])).label(\`${draft.platform} lint\`)`;
    - runs a soft judge over the drafts as JSON:
      ```ts
      t.judge("Every draft opens with a specific, concrete hook that makes the next line worth reading, sounds like a real person rather than generic AI copy, and matches its platform (short and punchy on X, structured with short paragraphs on LinkedIn, conversational on Threads).", { on: JSON.stringify(drafts, null, 2) }).atLeast(0.7)
      ```
  - **Imports.** The eval files import `lint.ts` and `shared.ts` by relative path, so they don't depend on the `@/` alias.
  - **Teardown.** None. Eval ideas are tagged `source_channel = "eval"`, because `ideaSourceChannel` reads `attributes.channel`. Studio hides them.
- The spec's "viral-hooks skill loaded" gate is replaced. The writer carries the hooks guide in its instructions, and the judge scores hook quality.

- [ ] **Step 1: Write `lib/eval-auth.test.ts`.**

```ts
const request = new Request("http://localhost/eve/v1/session");
const deps = (over: Partial<EvalOwnerDeps> = {}): EvalOwnerDeps => ({
  localDev: async () => ({ authenticator: "local-dev", issuer: "local", principalId: "dev", principalType: "user", subject: "dev", attributes: {} }),
  findOwner: async () => ({ id: "u1", email: "owner@example.com" }),
  brandFor: async () => "b1",
  env: () => ({ NODE_ENV: "development", HARPY_EVAL_AS_OWNER: "1" }),
  ...over,
});
it("maps a local dev caller to the owner with the eval channel", async () =>
  expect(await createEvalOwnerAuth(deps())(request)).toMatchObject({ principalId: "u1", authenticator: "harpy-eval", attributes: { brandId: "b1", channel: "eval" } }));
it("is off in production even with the flag", async () =>
  expect(await createEvalOwnerAuth(deps({ env: () => ({ NODE_ENV: "production", HARPY_EVAL_AS_OWNER: "1" }) }))(request)).toBeNull());
it("is off without the flag", async () =>
  expect(await createEvalOwnerAuth(deps({ env: () => ({ NODE_ENV: "development" }) }))(request)).toBeNull());
it("is off when localDev rejects the caller", async () =>
  expect(await createEvalOwnerAuth(deps({ localDev: async () => null }))(request)).toBeNull());
it("refuses when the owner never signed in", async () =>
  await expect(createEvalOwnerAuth(deps({ findOwner: async () => null }))(request)).rejects.toThrow("Sign in to harpy once"));
it("never grants tool stubs", async () =>
  expect(await createEvalOwnerAuth(deps())(request)).not.toHaveProperty("allowToolStubs"));
```

- [ ] **Step 2: Run it.** Run `pnpm vitest run lib/eval-auth`. Expected: FAIL.
- [ ] **Step 3: Implement** `lib/eval-auth.ts`, wire it into `agent/channels/eve.ts`, and add the evals, the script and the env line.
  - The env line: `HARPY_EVAL_AS_OWNER=  # local evals only: set to 1 to run evals as the owner; ignored in production`.
- [ ] **Step 4: Run the checks.** Run `pnpm test`, `pnpm typecheck` and `pnpm eve:build`. Expected: all pass.
- [ ] **Step 5: Check discovery.** Run `pnpm exec eve eval --help`. Expected: help text, with no crash. Running the evals needs P2 and a database, so the owner runs them (see Task 13).
- [ ] **Step 6: Commit.**

```bash
git add lib/eval-auth.ts lib/eval-auth.test.ts agent/channels/eve.ts evals package.json .env.example
git commit -m "test(evals): drafting evals with lint gates and hook judge; local eval sign-in as the owner"
```

---

### Task 13: Docs and owner checklist

**Files:**
- Modify: `docs/how-the-chatbot-works.md`, adding a "Drafting" section:
  - Studio request, then browser session, then `draft_posts`, then the writer in parallel, then lint and repair, then save and images, then Studio polling;
  - review actions without model turns;
  - revisions;
  - the voice guide, memory and examples.
- Modify: `docs/setup-and-deploy.md`, adding a "Stage 2" section:
  - migration 0010 only adds tables, so it can run before the merge with `! pnpm db:migrate:production`;
  - the Blob store is needed for draft images;
  - how to run the evals: `HARPY_EVAL_AS_OWNER=1 pnpm evals`, against a non-production database, with `AI_GATEWAY_API_KEY`;
  - the owner checklist below.
- Modify: `README.md` (what harpy does now: Studio, Brand voice, drafting from chat)
- Modify: `.agents/skills/eve-chat-template-eve/SKILL.md`, if it describes the agent's tools (add the drafting tools and the writer subagent)

**Owner checklist** (goes into `docs/setup-and-deploy.md`, matching the spec's Phase 2 "done when"):
1. In Studio, type "Small teams ship faster because they argue less" with all three platforms. Within about 2 minutes, three drafts appear, with an image on at least one.
2. Approve one draft. The chip reads "Approved", and it appears under Up next.
3. Skip one draft, then Restore it.
4. Edit one draft by hand and save. Then use "Ask harpy for a change" with "make it shorter". A new revision comes back.
5. Use J/K to move, A/E/S on the selected draft, and ? for help. Typing in the composer triggers nothing.
6. In Chat, send "Draft a LinkedIn post about our hiring mistakes". It appears in Studio as "via chat".
7. With Reel script and Carousel toggled and a blog link in the idea, a reel script and a carousel outline appear, with a cover image.
8. On Brand voice:
   - paste 3 or more past posts, then "Rewrite from my examples", and a new version appears;
   - restore an older version;
   - add the preference "never use hashtags", and the next drafts carry no hashtags.
9. In Settings, set the time zone. Suggested times in Studio show in that zone.
10. Run `HARPY_EVAL_AS_OWNER=1 pnpm evals` locally. Every lint gate passes, and the judge averages 0.7 or above.

- [ ] **Step 1: Write the docs updates** as listed.
- [ ] **Step 2: Run the final checks.** Run `pnpm test`, `pnpm typecheck`, `pnpm build` and `pnpm eve:build`. Expected: all four pass.
- [ ] **Step 3: Commit.**

```bash
git add docs README.md .agents
git commit -m "docs: stage 2 drafting, brand voice, evals and owner checklist"
```
