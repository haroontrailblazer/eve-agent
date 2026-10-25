import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { type DraftRecord, rawDraftRow, toDraftRecord } from "@/lib/drafts/records";
import { ACTION_FROM_STATES, type ReviewAction } from "@/lib/drafts/state";
import { getDraft, statusList, threadPartsJson } from "@/lib/drafts/store";
import { postsToText } from "@/lib/drafts/thread-text";
import type { ApprovedVia } from "@/lib/drafts/types";

export type ReviewFailure = "not_found" | "stale" | "invalid_state";
export type ReviewResult =
  | { readonly ok: true; readonly draft: DraftRecord }
  | { readonly ok: false; readonly reason: ReviewFailure; readonly draft: DraftRecord | null };

export function failureFor(
  current: DraftRecord | null,
  expectedRevision: number | null,
  _action: ReviewAction,
): ReviewFailure {
  if (!current) return "not_found";
  if (expectedRevision !== null && current.revision !== expectedRevision) return "stale";
  return "invalid_state";
}

export function reviewFailureMessage(reason: ReviewFailure): string {
  switch (reason) {
    case "not_found":
      return "That draft is gone.";
    case "stale":
      return "That draft changed. Showing the latest.";
    case "invalid_state":
      return "That draft can't do that right now.";
  }
}

type Target = { readonly brandId: string; readonly draftId: string };

async function resolve(
  rows: readonly Record<string, unknown>[],
  target: Target,
  expectedRevision: number | null,
  action: ReviewAction,
): Promise<ReviewResult> {
  const row = rows[0];
  if (row) return { ok: true, draft: toDraftRecord(rawDraftRow(row)) };
  const current = await getDraft(target.brandId, target.draftId);
  return { ok: false, reason: failureFor(current, expectedRevision, action), draft: current };
}

export async function approveDraft(
  input: Target & { readonly expectedRevision: number; readonly via: ApprovedVia },
): Promise<ReviewResult> {
  const result = await db.execute(sql`
update "draft" set "status" = 'approved', "approved_at" = now(), "approved_via" = ${input.via}, "updated_at" = now()
where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "revision" = ${input.expectedRevision} and "status" in (${statusList(ACTION_FROM_STATES.approve)})
returning *`);
  return resolve(result.rows, input, input.expectedRevision, "approve");
}

export async function skipDraft(input: Target & { readonly expectedRevision: number }): Promise<ReviewResult> {
  const result = await db.execute(sql`
update "draft" set "status" = 'skipped', "updated_at" = now()
where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "revision" = ${input.expectedRevision} and "status" in (${statusList(ACTION_FROM_STATES.skip)})
returning *`);
  return resolve(result.rows, input, input.expectedRevision, "skip");
}

export async function restoreDraft(input: Target): Promise<ReviewResult> {
  const result = await db.execute(sql`
update "draft" set "status" = 'pending_review', "updated_at" = now()
where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "status" in (${statusList(ACTION_FROM_STATES.restore)})
returning *`);
  return resolve(result.rows, input, null, "restore");
}

export async function saveManualEdit(
  input: Target & { readonly expectedRevision: number; readonly posts: readonly string[]; readonly userId: string },
): Promise<ReviewResult> {
  const text = postsToText(input.posts);
  const parts = threadPartsJson(input.posts);
  const result = await db.execute(sql`
with upd as (
  update "draft" set "text" = ${text}, "thread_parts" = ${parts}::jsonb, "revision" = "revision" + 1, "status" = 'pending_review', "approved_at" = null, "approved_via" = null, "revision_requested_at" = null, "updated_at" = now()
  where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "revision" = ${input.expectedRevision} and "status" in (${statusList(ACTION_FROM_STATES.edit)})
  returning *
), rev as (
  insert into "draft_revision" ("id", "draft_id", "brand_id", "revision", "kind", "text", "thread_parts", "instruction", "created_by_user_id", "created_at")
  select ${randomUUID()}::text, upd."id", upd."brand_id", upd."revision", 'manual_edit', upd."text", upd."thread_parts", null, ${input.userId}::text, now() from upd
)
select * from upd`);
  return resolve(result.rows, input, input.expectedRevision, "edit");
}

export async function requestRevision(input: Target & { readonly expectedRevision: number }): Promise<ReviewResult> {
  const result = await db.execute(sql`
update "draft" set "revision_requested_at" = now(), "updated_at" = now()
where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "revision" = ${input.expectedRevision} and "status" in (${statusList(ACTION_FROM_STATES.edit)})
returning *`);
  return resolve(result.rows, input, input.expectedRevision, "edit");
}

export async function completeRevision(
  input: Target & {
    readonly expectedRevision: number;
    readonly hook: string;
    readonly posts: readonly string[];
    readonly imagePrompt: string | null;
    readonly instruction: string;
    readonly userId: string | null;
  },
): Promise<ReviewResult> {
  const text = postsToText(input.posts);
  const parts = threadPartsJson(input.posts);
  const result = await db.execute(sql`
with upd as (
  update "draft" set "hook" = ${input.hook}, "text" = ${text}, "thread_parts" = ${parts}::jsonb, "image_prompt" = ${input.imagePrompt}, "revision" = "revision" + 1, "status" = 'pending_review', "approved_at" = null, "approved_via" = null, "revision_requested_at" = null, "updated_at" = now()
  where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "revision" = ${input.expectedRevision} and "status" in (${statusList(ACTION_FROM_STATES.edit)})
  returning *
), rev as (
  insert into "draft_revision" ("id", "draft_id", "brand_id", "revision", "kind", "text", "thread_parts", "instruction", "created_by_user_id", "created_at")
  select ${randomUUID()}::text, upd."id", upd."brand_id", upd."revision", 'user_edit_request', upd."text", upd."thread_parts", ${input.instruction}::text, ${input.userId}::text, now() from upd
)
select * from upd`);
  return resolve(result.rows, input, input.expectedRevision, "edit");
}

export async function clearRevisionRequest(brandId: string, draftId: string): Promise<void> {
  await db.execute(sql`
update "draft" set "revision_requested_at" = null, "updated_at" = now()
where "id" = ${draftId} and "brand_id" = ${brandId} and "revision_requested_at" is not null`);
}

export async function setProposedTime(input: Target & { readonly scheduledAt: string | null }): Promise<ReviewResult> {
  const result = await db.execute(sql`
update "draft" set "scheduled_at" = ${input.scheduledAt}::timestamptz, "updated_at" = now()
where "id" = ${input.draftId} and "brand_id" = ${input.brandId} and "status" = 'pending_review'
returning *`);
  return resolve(result.rows, input, null, "edit");
}
