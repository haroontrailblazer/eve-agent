import type { DraftStatus } from "@/lib/draft-status";
import type { DraftState } from "@/lib/drafts/types";

export type ReviewAction = "approve" | "skip" | "restore" | "edit";

export const ACTION_FROM_STATES: Readonly<Record<ReviewAction, readonly DraftState[]>> = {
  approve: ["pending_review"],
  skip: ["pending_review", "approved"],
  restore: ["skipped"],
  edit: ["pending_review", "approved"],
};

const STATE_AFTER: Readonly<Record<ReviewAction, DraftState>> = {
  approve: "approved",
  skip: "skipped",
  restore: "pending_review",
  edit: "pending_review",
};

export function canApply(action: ReviewAction, state: DraftState): boolean {
  return ACTION_FROM_STATES[action].includes(state);
}

export function stateAfter(action: ReviewAction): DraftState {
  return STATE_AFTER[action];
}

// "approved" and "skipped" join DraftStatus in a later task, which narrows
// this return type back to DraftStatus.
export function toDisplayStatus(state: DraftState): DraftStatus | "approved" | "skipped" {
  switch (state) {
    case "pending_review":
      return "needs_review";
    case "approved":
      return "approved";
    case "scheduled":
    case "publishing":
      return "scheduled";
    case "published":
      return "posted";
    case "failed":
      return "failed";
    case "skipped":
      return "skipped";
  }
}
