export const SOCIAL_PLATFORM_KEYS = ["x", "linkedin", "threads"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORM_KEYS)[number];

export const PIECE_KINDS = ["reel_script", "carousel_outline"] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];

export type DraftTarget =
  | { readonly kind: "post"; readonly platform: SocialPlatform }
  | { readonly kind: "piece"; readonly piece: PieceKind };

export const DRAFT_STATES = [
  "pending_review",
  "approved",
  "scheduled",
  "publishing",
  "published",
  "failed",
  "skipped",
] as const;
export type DraftState = (typeof DRAFT_STATES)[number];

export type IdeaSourceKind = "text" | "voice" | "photo" | "link" | "brief" | "repurpose";
// "studio" = typed in Studio; "web" = asked for in web chat.
export type IdeaSourceChannel = "studio" | "web" | "whatsapp" | "slack" | "schedule" | "eval";

export type IdeaRequest = {
  readonly platforms: readonly SocialPlatform[];
  readonly pieces: readonly PieceKind[];
};

export type RevisionKind = "generated" | "user_edit_request" | "manual_edit";
export type ApprovedVia = "web" | "whatsapp";

export function isSocialPlatform(value: unknown): value is SocialPlatform {
  return (SOCIAL_PLATFORM_KEYS as readonly unknown[]).includes(value);
}

export function isPieceKind(value: unknown): value is PieceKind {
  return (PIECE_KINDS as readonly unknown[]).includes(value);
}

export function targetKey(target: DraftTarget): string {
  return target.kind === "post" ? `post:${target.platform}` : `piece:${target.piece}`;
}
