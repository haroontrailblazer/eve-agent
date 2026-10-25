import type { ContentPieceRecord, DraftRecord, IdeaRecord } from "@/lib/drafts/records";

export type StudioDraft = DraftRecord & { readonly imageUrl: string | null };
export type StudioPiece = ContentPieceRecord & { readonly imageUrl: string | null };
export type StudioIdea = IdeaRecord & {
  readonly drafts: readonly StudioDraft[];
  readonly pieces: readonly StudioPiece[];
};
export type StudioSnapshot = {
  readonly timezone: string;
  readonly now: string;
  readonly ideas: readonly StudioIdea[];
  readonly upNext: readonly StudioDraft[];
};
