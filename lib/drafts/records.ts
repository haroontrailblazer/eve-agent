import type { ContentPiece, Draft, Idea } from "@/lib/db/schema";
import type {
  ApprovedVia,
  DraftState,
  IdeaRequest,
  IdeaSourceChannel,
  IdeaSourceKind,
  PieceKind,
  SocialPlatform,
} from "@/lib/drafts/types";

export type DraftRecord = {
  readonly id: string;
  readonly ideaId: string;
  readonly brandId: string;
  readonly platform: SocialPlatform;
  readonly status: DraftState;
  readonly revision: number;
  readonly hook: string;
  readonly text: string;
  readonly posts: readonly string[];
  readonly mediaIds: readonly string[];
  readonly imagePrompt: string | null;
  readonly scheduledAt: string | null;
  readonly approvedAt: string | null;
  readonly approvedVia: ApprovedVia | null;
  readonly notes: string;
  readonly revisionRequestedAt: string | null;
  readonly externalUrl: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type IdeaRecord = {
  readonly id: string;
  readonly brandId: string;
  readonly text: string;
  readonly sourceKind: IdeaSourceKind;
  readonly sourceChannel: IdeaSourceChannel;
  readonly sourceRef: string | null;
  readonly requested: IdeaRequest;
  readonly draftRequestedAt: string | null;
  readonly createdAt: string;
};

export type ReelScriptBody = {
  readonly hook: string;
  readonly beats: readonly {
    readonly visual: string;
    readonly voiceover: string;
    readonly onScreenText: string;
  }[];
  readonly caption: string;
  readonly notes: string;
};

export type CarouselOutlineBody = {
  readonly slides: readonly { readonly heading: string; readonly body: string }[];
  readonly coverImagePrompt: string | null;
  readonly caption: string;
  readonly notes: string;
};

export type ContentPieceRecord = {
  readonly id: string;
  readonly ideaId: string;
  readonly brandId: string;
  readonly kind: PieceKind;
  readonly title: string;
  readonly body: ReelScriptBody | CarouselOutlineBody;
  readonly mediaIds: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

function iso(value: Date): string {
  return value.toISOString();
}

function isoOrNull(value: Date | null): string | null {
  return value ? iso(value) : null;
}

export function toDraftRecord(row: Draft): DraftRecord {
  return {
    id: row.id,
    ideaId: row.ideaId,
    brandId: row.brandId,
    platform: row.platform,
    status: row.status,
    revision: row.revision,
    hook: row.hook,
    text: row.text,
    posts: row.threadParts && row.threadParts.length > 0 ? row.threadParts : [row.text],
    mediaIds: row.mediaIds,
    imagePrompt: row.imagePrompt,
    scheduledAt: isoOrNull(row.scheduledAt),
    approvedAt: isoOrNull(row.approvedAt),
    approvedVia: row.approvedVia,
    notes: row.notes,
    revisionRequestedAt: isoOrNull(row.revisionRequestedAt),
    externalUrl: row.externalUrl,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

function toDate(value: unknown): Date {
  return value instanceof Date ? value : new Date(String(value));
}

function toDateOrNull(value: unknown): Date | null {
  return value === null || value === undefined ? null : toDate(value);
}

function toJson<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  return (typeof value === "string" ? JSON.parse(value) : value) as T;
}

function strOrNull(value: unknown): string | null {
  return value === null || value === undefined ? null : String(value);
}

// db.execute rows use snake_case column names and may carry timestamps as strings.
export function rawDraftRow(row: Record<string, unknown>): Draft {
  return {
    id: String(row.id),
    ideaId: String(row.idea_id),
    brandId: String(row.brand_id),
    platform: row.platform as SocialPlatform,
    status: row.status as DraftState,
    revision: Number(row.revision),
    hook: String(row.hook ?? ""),
    text: String(row.text),
    threadParts: toJson<string[] | null>(row.thread_parts, null),
    mediaIds: toJson<string[]>(row.media_ids, []),
    imagePrompt: strOrNull(row.image_prompt),
    scheduledAt: toDateOrNull(row.scheduled_at),
    approvedAt: toDateOrNull(row.approved_at),
    approvedVia: (row.approved_via ?? null) as ApprovedVia | null,
    publishedAt: toDateOrNull(row.published_at),
    externalPostId: strOrNull(row.external_post_id),
    externalUrl: strOrNull(row.external_url),
    error: strOrNull(row.error),
    notes: String(row.notes ?? ""),
    revisionRequestedAt: toDateOrNull(row.revision_requested_at),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function rawContentPieceRow(row: Record<string, unknown>): ContentPiece {
  return {
    id: String(row.id),
    ideaId: String(row.idea_id),
    brandId: String(row.brand_id),
    kind: row.kind as PieceKind,
    title: String(row.title),
    body: toJson<unknown>(row.body, {}),
    mediaIds: toJson<string[]>(row.media_ids, []),
    createdAt: toDate(row.created_at),
    updatedAt: toDate(row.updated_at),
  };
}

export function toIdeaRecord(row: Idea): IdeaRecord {
  return {
    id: row.id,
    brandId: row.brandId,
    text: row.text,
    sourceKind: row.sourceKind,
    sourceChannel: row.sourceChannel,
    sourceRef: row.sourceRef,
    requested: row.requested,
    draftRequestedAt: isoOrNull(row.draftRequestedAt),
    createdAt: iso(row.createdAt),
  };
}

export function toContentPieceRecord(row: ContentPiece): ContentPieceRecord {
  return {
    id: row.id,
    ideaId: row.ideaId,
    brandId: row.brandId,
    kind: row.kind,
    title: row.title,
    body: row.body as ReelScriptBody | CarouselOutlineBody,
    mediaIds: row.mediaIds,
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
