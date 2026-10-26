import { useState } from "react";
import { toast } from "sonner";
import { retryIdeaAction, sendIdeaToWhatsAppAction } from "@/app/actions/studio";
import { IdeaBlock } from "@/components/harpy/idea-block";
import { showRequestError } from "@/components/harpy/show-request-error";
import { WorkingIndicator } from "@/components/harpy/working-indicator";
import { Button } from "@/components/ui/button";
import { startHarpyRun } from "@/lib/studio/start-run";
import type { StudioDraft as StudioDraftRecord, StudioIdea } from "@/lib/studio/types";
import { ideaPhase, ideaSourceLabel } from "@/lib/studio/view-model";
import { ContentPieceCard } from "./content-piece-card";
import { StudioDraft, type DraftReview } from "./studio-draft";
import { STUDIO_ACTION_FAILED_MESSAGE } from "./use-studio-snapshot";

const START_FAILED_MESSAGE = "harpy couldn't start drafting. Try again in a moment.";

// An idea, whether harpy is still drafting it, and the drafts and pieces it
// produced. A run that went quiet for 10 minutes offers Try again, which drafts
// only the targets that are still missing.
export function IdeaItem({
  busyIds,
  editingIds,
  idea,
  now,
  onEditChange,
  onReview,
  onSelect,
  refresh,
  selectedId,
  timezone,
  whatsappLinked,
}: {
  readonly idea: StudioIdea;
  readonly timezone: string;
  readonly now: Date;
  readonly selectedId: string | null;
  readonly busyIds: ReadonlySet<string>;
  readonly editingIds: ReadonlySet<string>;
  readonly onSelect: (draftId: string) => void;
  readonly onReview: (draft: StudioDraftRecord, action: DraftReview) => void;
  readonly onEditChange: (draftId: string, editing: boolean) => void;
  readonly refresh: () => Promise<void>;
  readonly whatsappLinked: boolean;
}) {
  const [retrying, setRetrying] = useState(false);
  const [sending, setSending] = useState(false);
  const phase = ideaPhase(idea, now);

  async function retry() {
    if (retrying) return;
    setRetrying(true);

    try {
      const result = await retryIdeaAction({ ideaId: idea.id });

      if (!result.ok) {
        showRequestError(result.message);
      } else {
        try {
          await startHarpyRun(result.message);
        } catch {
          showRequestError(START_FAILED_MESSAGE);
        }
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setRetrying(false);
    }
  }

  async function sendToWhatsApp() {
    if (sending) return;
    setSending(true);

    try {
      const result = await sendIdeaToWhatsAppAction({ ideaId: idea.id });

      if (result.ok) {
        toast(result.message);
      } else {
        showRequestError(result.message);
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      setSending(false);
    }
  }

  const canSendToWhatsApp = whatsappLinked && idea.drafts.some((draft) => draft.status === "pending_review");

  return (
    <IdeaBlock sourceLabel={ideaSourceLabel(idea, now)} text={idea.text}>
      {phase === "drafting" ? <WorkingIndicator label="harpy is drafting" /> : null}
      {phase === "stalled" ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-small text-muted-foreground">Some drafts didn&apos;t come back.</p>
          <Button disabled={retrying} onClick={() => void retry()} size="sm" type="button" variant="outline">
            Try again
          </Button>
        </div>
      ) : null}
      {canSendToWhatsApp ? (
        <div>
          <Button disabled={sending} onClick={() => void sendToWhatsApp()} size="sm" type="button" variant="outline">
            {sending ? "Sending..." : "Send to WhatsApp"}
          </Button>
        </div>
      ) : null}
      {idea.drafts.map((draft) => (
        <StudioDraft
          draft={draft}
          isBusy={busyIds.has(draft.id)}
          isEditing={editingIds.has(draft.id)}
          isSelected={selectedId === draft.id}
          key={draft.id}
          now={now}
          onEditChange={(editing) => onEditChange(draft.id, editing)}
          onReview={(action) => onReview(draft, action)}
          onSelect={() => onSelect(draft.id)}
          refresh={refresh}
          timezone={timezone}
        />
      ))}
      {idea.pieces.map((piece) => (
        <ContentPieceCard key={piece.id} piece={piece} />
      ))}
    </IdeaBlock>
  );
}
