import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { contentPiece, draft, idea } from "@/lib/db/schema";
import {
  type CarouselOutlineBody,
  type ContentPieceRecord,
  type DraftRecord,
  type IdeaRecord,
  type ReelScriptBody,
  rawDraftRow,
  toContentPieceRecord,
  toDraftRecord,
  toIdeaRecord,
} from "@/lib/drafts/records";
import { ACTION_FROM_STATES } from "@/lib/drafts/state";
import { postsToText } from "@/lib/drafts/thread-text";
import type {
  DraftState,
  IdeaRequest,
  IdeaSourceChannel,
  IdeaSourceKind,
  PieceKind,
  SocialPlatform,
} from "@/lib/drafts/types";

export const IDEA_MAX_CHARS = 8_000;

export function statusList(states: readonly DraftState[]) {
  return sql.join(
    states.map((state) => sql`${state}`),
    sql`, `,
  );
}

// jsonb values go through raw SQL as JSON text and are cast; null for a single post.
export function threadPartsJson(posts: readonly string[]): string | null {
  return posts.length > 1 ? JSON.stringify(posts) : null;
}

export async function createIdea(input: {
  readonly brandId: string;
  readonly userId: string | null;
  readonly text: string;
  readonly sourceKind: IdeaSourceKind;
  readonly sourceChannel: IdeaSourceChannel;
  readonly sourceRef?: string | null;
  readonly requested: IdeaRequest;
}): Promise<IdeaRecord> {
  const [row] = await db
    .insert(idea)
    .values({
      id: randomUUID(),
      brandId: input.brandId,
      createdByUserId: input.userId,
      text: input.text,
      sourceKind: input.sourceKind,
      sourceChannel: input.sourceChannel,
      sourceRef: input.sourceRef ?? null,
      requested: input.requested,
      draftRequestedAt: sql`now()`,
    })
    .returning();
  return toIdeaRecord(row);
}

export async function markIdeaRequested(brandId: string, ideaId: string): Promise<IdeaRecord | null> {
  const [row] = await db
    .update(idea)
    .set({ draftRequestedAt: sql`now()` })
    .where(and(eq(idea.id, ideaId), eq(idea.brandId, brandId)))
    .returning();
  return row ? toIdeaRecord(row) : null;
}

export async function getIdea(brandId: string, ideaId: string): Promise<IdeaRecord | null> {
  const [row] = await db
    .select()
    .from(idea)
    .where(and(eq(idea.id, ideaId), eq(idea.brandId, brandId)))
    .limit(1);
  return row ? toIdeaRecord(row) : null;
}

export async function listDraftsForIdea(brandId: string, ideaId: string): Promise<DraftRecord[]> {
  const rows = await db
    .select()
    .from(draft)
    .where(and(eq(draft.ideaId, ideaId), eq(draft.brandId, brandId)))
    .orderBy(asc(draft.createdAt));
  return rows.map(toDraftRecord);
}

export async function listPiecesForIdea(brandId: string, ideaId: string): Promise<ContentPieceRecord[]> {
  const rows = await db
    .select()
    .from(contentPiece)
    .where(and(eq(contentPiece.ideaId, ideaId), eq(contentPiece.brandId, brandId)))
    .orderBy(asc(contentPiece.createdAt));
  return rows.map(toContentPieceRecord);
}

export async function getDraft(brandId: string, draftId: string): Promise<DraftRecord | null> {
  const [row] = await db
    .select()
    .from(draft)
    .where(and(eq(draft.id, draftId), eq(draft.brandId, brandId)))
    .limit(1);
  return row ? toDraftRecord(row) : null;
}

export async function listDrafts(
  brandId: string,
  options: { readonly status?: DraftState; readonly limit: number },
): Promise<DraftRecord[]> {
  const where = options.status
    ? and(eq(draft.brandId, brandId), eq(draft.status, options.status))
    : eq(draft.brandId, brandId);
  const rows = await db.select().from(draft).where(where).orderBy(desc(draft.updatedAt)).limit(options.limit);
  return rows.map(toDraftRecord);
}

export type SaveGeneratedDraftInput = {
  readonly brandId: string;
  readonly ideaId: string;
  readonly platform: SocialPlatform;
  readonly hook: string;
  readonly posts: readonly string[];
  readonly imagePrompt: string | null;
  readonly scheduledAt: string | null;
  readonly notes: string;
  readonly mode: "create" | { readonly expectedRevision: number };
};

export type SaveGeneratedDraftResult =
  | { readonly ok: true; readonly draft: DraftRecord; readonly created: boolean }
  | { readonly ok: false; readonly reason: "stale" | "not_found"; readonly draft: DraftRecord | null };

export async function saveGeneratedDraft(input: SaveGeneratedDraftInput): Promise<SaveGeneratedDraftResult> {
  const text = postsToText(input.posts);
  const parts = threadPartsJson(input.posts);
  const revisionId = randomUUID();

  const loadByIdeaPlatform = async () => {
    const [row] = await db
      .select()
      .from(draft)
      .where(
        and(eq(draft.ideaId, input.ideaId), eq(draft.platform, input.platform), eq(draft.brandId, input.brandId)),
      )
      .limit(1);
    return row ? toDraftRecord(row) : null;
  };

  if (input.mode === "create") {
    const draftId = randomUUID();
    const result = await db.execute(sql`
with ins as (
  insert into "draft" ("id", "idea_id", "brand_id", "platform", "status", "revision", "hook", "text", "thread_parts", "image_prompt", "scheduled_at", "notes", "created_at", "updated_at")
  values (${draftId}, ${input.ideaId}, ${input.brandId}, ${input.platform}, 'pending_review', 1, ${input.hook}, ${text}, ${parts}::jsonb, ${input.imagePrompt}, ${input.scheduledAt}::timestamptz, ${input.notes}, now(), now())
  on conflict ("idea_id", "platform") do nothing
  returning *
), rev as (
  insert into "draft_revision" ("id", "draft_id", "brand_id", "revision", "kind", "text", "thread_parts", "instruction", "created_by_user_id", "created_at")
  select ${revisionId}::text, ins."id", ins."brand_id", 1, 'generated', ins."text", ins."thread_parts", null, null, now() from ins
  on conflict ("draft_id", "revision") do nothing
)
select * from ins`);
    const row = result.rows[0];
    if (row) return { ok: true, draft: toDraftRecord(rawDraftRow(row)), created: true };

    const existing = await loadByIdeaPlatform();
    if (!existing) return { ok: false, reason: "not_found", draft: null };
    return { ok: true, draft: existing, created: false };
  }

  const result = await db.execute(sql`
with upd as (
  update "draft" set "hook" = ${input.hook}, "text" = ${text}, "thread_parts" = ${parts}::jsonb, "image_prompt" = ${input.imagePrompt}, "scheduled_at" = ${input.scheduledAt}::timestamptz, "notes" = ${input.notes}, "revision" = "revision" + 1, "status" = 'pending_review', "approved_at" = null, "approved_via" = null, "revision_requested_at" = null, "updated_at" = now()
  where "idea_id" = ${input.ideaId} and "platform" = ${input.platform} and "brand_id" = ${input.brandId} and "revision" = ${input.mode.expectedRevision} and "status" in (${statusList(ACTION_FROM_STATES.edit)})
  returning *
), rev as (
  insert into "draft_revision" ("id", "draft_id", "brand_id", "revision", "kind", "text", "thread_parts", "instruction", "created_by_user_id", "created_at")
  select ${revisionId}::text, upd."id", upd."brand_id", upd."revision", 'generated', upd."text", upd."thread_parts", null, null, now() from upd
)
select * from upd`);
  const row = result.rows[0];
  if (row) return { ok: true, draft: toDraftRecord(rawDraftRow(row)), created: false };

  const current = await loadByIdeaPlatform();
  if (!current) return { ok: false, reason: "not_found", draft: null };
  return { ok: false, reason: "stale", draft: current };
}

export async function saveContentPiece(input: {
  readonly brandId: string;
  readonly ideaId: string;
  readonly kind: PieceKind;
  readonly title: string;
  readonly body: ReelScriptBody | CarouselOutlineBody;
  readonly mode: "create" | "replace";
}): Promise<{ readonly piece: ContentPieceRecord; readonly created: boolean }> {
  const target = [contentPiece.ideaId, contentPiece.kind];
  const insert = db.insert(contentPiece).values({
    id: randomUUID(),
    ideaId: input.ideaId,
    brandId: input.brandId,
    kind: input.kind,
    title: input.title,
    body: input.body,
  });
  const rows =
    input.mode === "create"
      ? await insert.onConflictDoNothing({ target }).returning()
      : await insert
          .onConflictDoUpdate({
            target,
            set: { title: input.title, body: input.body, updatedAt: sql`now()` },
            setWhere: eq(contentPiece.brandId, input.brandId),
          })
          .returning();
  const row = rows[0];
  if (row) {
    // A fresh insert has createdAt equal to updatedAt (same now()); an update moves updatedAt.
    return { piece: toContentPieceRecord(row), created: row.createdAt.getTime() === row.updatedAt.getTime() };
  }

  const [existing] = await db
    .select()
    .from(contentPiece)
    .where(
      and(
        eq(contentPiece.ideaId, input.ideaId),
        eq(contentPiece.kind, input.kind),
        eq(contentPiece.brandId, input.brandId),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("content piece could not be saved");
  return { piece: toContentPieceRecord(existing), created: false };
}

export async function setDraftMedia(input: {
  readonly brandId: string;
  readonly draftId: string;
  readonly revision: number;
  readonly mediaIds: readonly string[];
}): Promise<boolean> {
  const rows = await db
    .update(draft)
    .set({ mediaIds: [...input.mediaIds], updatedAt: sql`now()` })
    .where(and(eq(draft.id, input.draftId), eq(draft.brandId, input.brandId), eq(draft.revision, input.revision)))
    .returning({ id: draft.id });
  return rows.length > 0;
}

export async function setPieceMedia(input: {
  readonly brandId: string;
  readonly pieceId: string;
  readonly mediaIds: readonly string[];
}): Promise<boolean> {
  const rows = await db
    .update(contentPiece)
    .set({ mediaIds: [...input.mediaIds], updatedAt: sql`now()` })
    .where(and(eq(contentPiece.id, input.pieceId), eq(contentPiece.brandId, input.brandId)))
    .returning({ id: contentPiece.id });
  return rows.length > 0;
}
