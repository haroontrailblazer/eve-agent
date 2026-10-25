import { containsLink, countPostChars, lintPost } from "@/lib/drafts/lint";
import type { DraftRecord } from "@/lib/drafts/records";
import { canApply, type ReviewAction } from "@/lib/drafts/state";
import type { DraftTarget } from "@/lib/drafts/types";
import { PLATFORMS } from "@/lib/platforms";
import type { StudioDraft, StudioIdea, StudioSnapshot } from "@/lib/studio/types";

export const DRAFTING_STALE_MS = 600_000;

export type IdeaPhase = "drafting" | "ready" | "stalled";

// The requested targets that have no draft or piece yet.
export function missingTargets(idea: StudioIdea): DraftTarget[] {
  const missing: DraftTarget[] = [];
  for (const platform of idea.requested.platforms) {
    if (!idea.drafts.some((d) => d.platform === platform)) missing.push({ kind: "post", platform });
  }
  for (const piece of idea.requested.pieces) {
    if (!idea.pieces.some((p) => p.kind === piece)) missing.push({ kind: "piece", piece });
  }
  return missing;
}

function within(iso: string | null, now: Date): boolean {
  if (!iso) return false;
  return now.getTime() - new Date(iso).getTime() <= DRAFTING_STALE_MS;
}

export function ideaPhase(idea: StudioIdea, now: Date): IdeaPhase {
  if (missingTargets(idea).length === 0) return "ready";
  return within(idea.draftRequestedAt, now) ? "drafting" : "stalled";
}

export function isRevising(draft: StudioDraft, now: Date): boolean {
  return within(draft.revisionRequestedAt, now);
}

// Whether a draft's card offers a review action, for the buttons and the keys
// alike. Approve waits while harpy revises the draft: the new revision would
// put it back in review and silently undo the approval.
export function canReview(draft: StudioDraft, action: ReviewAction, now: Date): boolean {
  if (action === "approve" && isRevising(draft, now)) return false;
  return canApply(action, draft.status);
}

export function needsPolling(snapshot: StudioSnapshot, now: Date): boolean {
  return snapshot.ideas.some(
    (idea) => ideaPhase(idea, now) === "drafting" || idea.drafts.some((d) => isRevising(d, now)),
  );
}

// "Tue 9:30 AM" in the given zone.
export function formatLocalTime(iso: string, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  })
    .format(new Date(iso))
    .replace(",", "")
    .replace(/[  ]/g, " ");
}

export function draftMeta(
  draft: Pick<DraftRecord, "platform" | "posts" | "text" | "scheduledAt">,
  timezone: string,
): string {
  const size =
    draft.posts.length > 1
      ? `${draft.posts.length} posts`
      : `${countPostChars(draft.platform, draft.posts[0] ?? draft.text)} chars`;
  const parts = [PLATFORMS[draft.platform].label, size];
  if (draft.scheduledAt) parts.push(formatLocalTime(draft.scheduledAt, timezone));
  if (draft.platform === "x" && draft.posts.some(containsLink)) parts.push("includes a link", "$0.20");
  return parts.join(" · ");
}

export function draftWarnings(draft: StudioDraft): string[] {
  return lintPost({ platform: draft.platform, posts: draft.posts, allowLinks: draft.platform !== "x" }).map(
    (issue) => issue.message,
  );
}

const SOURCE_LABELS: Record<StudioIdea["sourceChannel"], string> = {
  studio: "via Studio",
  web: "via chat",
  whatsapp: "via WhatsApp",
  slack: "via Slack",
  schedule: "via brief",
  eval: "via eval",
};

function relativeAge(iso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)} h ago`;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(iso));
}

export function ideaSourceLabel(idea: StudioIdea, now: Date): string {
  return `${SOURCE_LABELS[idea.sourceChannel]} · ${relativeAge(idea.createdAt, now)}`;
}

export function selectableDraftIds(snapshot: StudioSnapshot): string[] {
  return snapshot.ideas.flatMap((idea) => idea.drafts.map((d) => d.id));
}
