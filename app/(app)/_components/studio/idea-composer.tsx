import { useState, type KeyboardEvent } from "react";
import { createIdeaAction } from "@/app/actions/studio";
import { KbdHint } from "@/components/harpy/kbd-hint";
import { showRequestError } from "@/components/harpy/show-request-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { IDEA_MAX_CHARS } from "@/lib/drafts/limits";
import {
  isPieceKind,
  isSocialPlatform,
  type PieceKind,
  type SocialPlatform,
} from "@/lib/drafts/types";
import { startHarpyRun } from "@/lib/studio/start-run";
import { STUDIO_ACTION_FAILED_MESSAGE } from "./use-studio-snapshot";

const START_FAILED_MESSAGE = "The idea is saved, but harpy couldn't start drafting it.";

const TARGETS: readonly { readonly value: SocialPlatform | PieceKind; readonly label: string }[] = [
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "threads", label: "Threads" },
  { value: "reel_script", label: "Reel script" },
  { value: "carousel_outline", label: "Carousel" },
];
const DEFAULT_TARGETS: readonly string[] = ["x", "linkedin", "threads"];

// Takes an idea and what to make from it. Submitting saves the idea, starts a
// harpy run that drafts it, clears the box and reloads the snapshot. If the
// run fails to start, the saved idea still shows, and offers Try again once it
// has been quiet for 10 minutes.
export function IdeaComposer({ refresh }: { readonly refresh: () => Promise<void> }) {
  const [text, setText] = useState("");
  const [targets, setTargets] = useState<readonly string[]>(DEFAULT_TARGETS);
  const [pending, setPending] = useState(false);

  async function submit() {
    if (pending || text.trim() === "") return;
    setPending(true);

    try {
      const result = await createIdeaAction({
        text,
        platforms: targets.filter(isSocialPlatform),
        pieces: targets.filter(isPieceKind),
      });

      if (!result.ok) {
        showRequestError(result.message);
        return;
      }

      try {
        await startHarpyRun(result.message);
      } catch {
        showRequestError(START_FAILED_MESSAGE);
      }

      setText("");
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setPending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void submit();
    }
  }

  return (
    <Card className="gap-3 p-4">
      <form
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <textarea
          aria-label="Idea"
          className="min-h-24 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-shadow outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 read-only:opacity-60 md:text-body dark:bg-input/30"
          maxLength={IDEA_MAX_CHARS}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Drop an idea, a link or a rough note"
          readOnly={pending}
          rows={3}
          value={text}
        />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <ToggleGroup
            aria-label="Draft for"
            className="flex-wrap"
            disabled={pending}
            onValueChange={setTargets}
            size="sm"
            spacing={1}
            type="multiple"
            value={[...targets]}
            variant="outline"
          >
            {TARGETS.map((target) => (
              <ToggleGroupItem key={target.value} value={target.value}>
                {target.label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button disabled={pending || text.trim() === ""} size="sm" type="submit">
            Draft it
            <KbdHint keys={["Ctrl", "Enter"]} />
          </Button>
        </div>
      </form>
    </Card>
  );
}
