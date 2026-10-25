import { useCallback, useRef, useState } from "react";
import { approveDraftAction, restoreDraftAction, skipDraftAction } from "@/app/actions/studio";
import { DraftCard } from "@/components/harpy/draft-card";
import { showRequestError } from "@/components/harpy/show-request-error";
import { canApply, toDisplayStatus } from "@/lib/drafts/state";
import type { StudioDraft as StudioDraftRecord } from "@/lib/studio/types";
import { draftMeta, draftWarnings, isRevising } from "@/lib/studio/view-model";
import { DraftEditor } from "./draft-editor";
import { STUDIO_ACTION_FAILED_MESSAGE } from "./use-studio-snapshot";

const APPROVED_NOTICE = "Approved. It waits here until publishing is set up.";

export type DraftReview = "approve" | "skip" | "restore";

// The element id of a draft's card, so the keyboard can scroll it into view.
export function draftElementId(draftId: string): string {
  return `studio-draft-${draftId}`;
}

// Runs Approve, Skip and Restore. A draft runs one review at a time: while one
// is out (until the snapshot after it has loaded) its id is in `busyIds` and
// further reviews of it are dropped, so a double click sends one request.
export function useDraftReview(refresh: () => Promise<void>) {
  const busyRef = useRef(new Set<string>());
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

  const review = useCallback(
    async (draft: StudioDraftRecord, action: DraftReview) => {
      if (busyRef.current.has(draft.id)) return;

      busyRef.current.add(draft.id);
      setBusyIds(new Set(busyRef.current));

      try {
        // The card's revision and status guard the write, so an action taken
        // on a draft that changed elsewhere is refused instead of applied.
        const guard = { draftId: draft.id, expectedRevision: draft.revision, expectedStatus: draft.status };
        const result =
          action === "approve"
            ? await approveDraftAction(guard)
            : action === "skip"
              ? await skipDraftAction(guard)
              : await restoreDraftAction({ draftId: draft.id });

        if (!result.ok) {
          showRequestError(result.message);
        }
      } catch {
        showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
      } finally {
        await refresh();
        busyRef.current.delete(draft.id);
        setBusyIds(new Set(busyRef.current));
      }
    },
    [refresh],
  );

  return { busyIds, review };
}

// A draft card with the actions its state allows. Edit swaps the text for the
// editor; the card's own actions hide while it is open.
export function StudioDraft({
  draft,
  isBusy,
  isEditing,
  isSelected,
  now,
  onEditChange,
  onReview,
  onSelect,
  refresh,
  timezone,
}: {
  readonly draft: StudioDraftRecord;
  readonly timezone: string;
  readonly now: Date;
  readonly isSelected: boolean;
  readonly isBusy: boolean;
  readonly isEditing: boolean;
  readonly onSelect: () => void;
  readonly onReview: (action: DraftReview) => void;
  readonly onEditChange: (editing: boolean) => void;
  readonly refresh: () => Promise<void>;
}) {
  const editing = isEditing && canApply("edit", draft.status);
  const allows = (action: Parameters<typeof canApply>[0]) => !editing && canApply(action, draft.status);

  return (
    <div className="scroll-m-4" id={draftElementId(draft.id)} onClickCapture={onSelect}>
      <DraftCard
        imageUrl={draft.imageUrl ?? undefined}
        isBusy={isBusy}
        isSelected={isSelected}
        isWorking={isRevising(draft, now)}
        meta={draftMeta(draft, timezone)}
        notice={draft.status === "approved" ? APPROVED_NOTICE : undefined}
        onApprove={allows("approve") ? () => onReview("approve") : undefined}
        onEdit={allows("edit") ? () => onEditChange(true) : undefined}
        onRestore={allows("restore") ? () => onReview("restore") : undefined}
        onSkip={allows("skip") ? () => onReview("skip") : undefined}
        platform={draft.platform}
        status={toDisplayStatus(draft.status)}
        text={draft.text}
        warnings={draftWarnings(draft)}
      >
        {editing ? <DraftEditor draft={draft} onClose={() => onEditChange(false)} refresh={refresh} /> : undefined}
      </DraftCard>
    </div>
  );
}
