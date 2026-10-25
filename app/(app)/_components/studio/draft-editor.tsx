import { useId, useState, type KeyboardEvent } from "react";
import { requestDraftRevisionAction, saveDraftEditAction } from "@/app/actions/studio";
import { showRequestError } from "@/components/harpy/show-request-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PLATFORM_LIMITS } from "@/lib/drafts/lint";
import { postsToEditText } from "@/lib/drafts/thread-text";
import { startHarpyRun } from "@/lib/studio/start-run";
import type { StudioDraft } from "@/lib/studio/types";
import { STUDIO_ACTION_FAILED_MESSAGE } from "./use-studio-snapshot";

const REVISION_START_FAILED_MESSAGE = "harpy couldn't start the change. Try again in a moment.";
const INSTRUCTION_MAX_CHARS = 2000;

// Edits a draft in place of its text. Save stores the text as a new revision;
// Ask harpy hands an instruction to harpy, which rewrites the draft. Both are
// guarded by the revision the editor opened on, so they never overwrite a
// version the owner has not seen. Cancel or Escape closes it unsaved.
export function DraftEditor({
  draft,
  onClose,
  refresh,
}: {
  readonly draft: StudioDraft;
  readonly onClose: () => void;
  readonly refresh: () => Promise<void>;
}) {
  const [baseRevision] = useState(draft.revision);
  const [text, setText] = useState(() => postsToEditText(draft.posts));
  const [instruction, setInstruction] = useState("");
  const [pending, setPending] = useState(false);
  const instructionId = useId();
  const isThread = PLATFORM_LIMITS[draft.platform].maxParts > 1;

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }
  }

  async function save() {
    if (pending) return;
    setPending(true);
    let close = false;

    try {
      const result = await saveDraftEditAction({ draftId: draft.id, expectedRevision: baseRevision, text });

      if (result.ok) {
        close = true;
      } else {
        showRequestError(result.message);
        // The draft changed since the editor opened: close it so the card
        // shows the latest version, as the message says.
        close = result.draft !== null && result.draft.revision !== baseRevision;
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setPending(false);
    }

    if (close) onClose();
  }

  async function ask() {
    const change = instruction.trim();
    if (pending || change === "") return;
    setPending(true);
    let close = false;

    try {
      const result = await requestDraftRevisionAction({
        draftId: draft.id,
        expectedRevision: baseRevision,
        instruction: change,
      });

      // Either way the editor closes. A refusal means the draft changed or is
      // gone, so the card shows the latest version, as Save does on a conflict.
      close = true;

      if (!result.ok) {
        showRequestError(result.message);
      } else {
        // The draft is marked as being revised; if the run fails to start,
        // the card stops showing it as refining after 10 minutes.
        try {
          await startHarpyRun(result.message);
        } catch {
          showRequestError(REVISION_START_FAILED_MESSAGE);
        }
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setPending(false);
    }

    if (close) onClose();
  }

  return (
    <div className="flex flex-col gap-3" onKeyDown={handleKeyDown}>
      <div className="flex flex-col gap-1.5">
        <textarea
          aria-label="Draft text"
          autoFocus
          className="min-h-32 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-shadow outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 read-only:opacity-60 md:text-body dark:bg-input/30"
          onChange={(event) => setText(event.target.value)}
          readOnly={pending}
          rows={6}
          value={text}
        />
        {isThread ? (
          <p className="text-meta text-muted-foreground">Separate posts with a line that has only ---</p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} onClick={() => void save()} size="sm" type="button">
          Save
        </Button>
        <Button disabled={pending} onClick={onClose} size="sm" type="button" variant="ghost">
          Cancel
        </Button>
      </div>
      <form
        className="flex flex-col gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <Label className="text-small" htmlFor={instructionId}>
          Ask harpy for a change
        </Label>
        <div className="flex gap-2">
          <Input
            id={instructionId}
            maxLength={INSTRUCTION_MAX_CHARS}
            onChange={(event) => setInstruction(event.target.value)}
            readOnly={pending}
            value={instruction}
          />
          <Button disabled={pending || instruction.trim() === ""} size="sm" type="submit" variant="outline">
            Ask harpy
          </Button>
        </div>
      </form>
    </div>
  );
}
