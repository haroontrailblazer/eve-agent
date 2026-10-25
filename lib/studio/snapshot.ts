import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { getBrandSettings } from "@/lib/db/brands";
import { db } from "@/lib/db/client";
import { contentPiece, draft, idea, mediaAsset } from "@/lib/db/schema";
import {
  type DraftRecord,
  toContentPieceRecord,
  toDraftRecord,
  toIdeaRecord,
} from "@/lib/drafts/records";
import { SOCIAL_PLATFORM_KEYS } from "@/lib/drafts/types";
import type { StudioDraft, StudioSnapshot } from "@/lib/studio/types";

export const STUDIO_IDEA_LIMIT = 30;
export const UP_NEXT_LIMIT = 8;

// blob_url of each media id, brand-scoped, in one query.
async function imageUrlsFor(brandId: string, mediaIds: readonly string[]): Promise<Map<string, string>> {
  const unique = [...new Set(mediaIds)];
  if (unique.length === 0) return new Map();
  const rows = await db
    .select({ id: mediaAsset.id, blobUrl: mediaAsset.blobUrl })
    .from(mediaAsset)
    .where(and(eq(mediaAsset.brandId, brandId), inArray(mediaAsset.id, unique)));
  return new Map(rows.map((row) => [row.id, row.blobUrl]));
}

function withImage(record: DraftRecord, urls: ReadonlyMap<string, string>): StudioDraft {
  const first = record.mediaIds[0];
  return { ...record, imageUrl: first ? (urls.get(first) ?? null) : null };
}

// A draft with its first image attached, for action results.
export async function toStudioDraft(brandId: string, record: DraftRecord): Promise<StudioDraft> {
  return withImage(record, await imageUrlsFor(brandId, record.mediaIds.slice(0, 1)));
}

function platformRank(platform: string): number {
  return (SOCIAL_PLATFORM_KEYS as readonly string[]).indexOf(platform);
}

export async function loadStudioSnapshot(brandId: string): Promise<StudioSnapshot> {
  const [settings, ideaRows, upNextRows] = await Promise.all([
    getBrandSettings(brandId),
    db
      .select()
      .from(idea)
      .where(and(eq(idea.brandId, brandId), ne(idea.sourceChannel, "eval")))
      .orderBy(desc(idea.createdAt))
      .limit(STUDIO_IDEA_LIMIT),
    db
      .select({ draft })
      .from(draft)
      .innerJoin(idea, eq(draft.ideaId, idea.id))
      .where(and(eq(draft.brandId, brandId), eq(draft.status, "approved"), ne(idea.sourceChannel, "eval")))
      .orderBy(sql`${draft.scheduledAt} asc nulls last`, asc(draft.approvedAt))
      .limit(UP_NEXT_LIMIT),
  ]);

  const ideaIds = ideaRows.map((row) => row.id);
  const [draftRows, pieceRows] =
    ideaIds.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select()
            .from(draft)
            .where(and(eq(draft.brandId, brandId), inArray(draft.ideaId, ideaIds)))
            .orderBy(asc(draft.createdAt)),
          db
            .select()
            .from(contentPiece)
            .where(and(eq(contentPiece.brandId, brandId), inArray(contentPiece.ideaId, ideaIds)))
            .orderBy(asc(contentPiece.createdAt)),
        ]);

  const drafts = draftRows.map(toDraftRecord);
  const pieces = pieceRows.map(toContentPieceRecord);
  const upNext = upNextRows.map((row) => toDraftRecord(row.draft));

  const urls = await imageUrlsFor(
    brandId,
    [...drafts, ...pieces, ...upNext].flatMap((item) => item.mediaIds.slice(0, 1)),
  );

  const studioDrafts = drafts.map((d) => withImage(d, urls));
  return {
    timezone: settings?.timezone ?? "UTC",
    now: new Date().toISOString(),
    ideas: ideaRows.map((row) => {
      const record = toIdeaRecord(row);
      return {
        ...record,
        drafts: studioDrafts
          .filter((d) => d.ideaId === record.id)
          .sort((a, b) => platformRank(a.platform) - platformRank(b.platform)),
        pieces: pieces
          .filter((p) => p.ideaId === record.id)
          .map((p) => ({ ...p, imageUrl: p.mediaIds[0] ? (urls.get(p.mediaIds[0]) ?? null) : null })),
      };
    }),
    upNext: upNext.map((d) => withImage(d, urls)),
  };
}
