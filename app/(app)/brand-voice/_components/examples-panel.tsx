import { Trash2Icon } from "lucide-react";
import { useState } from "react";
import { addVoiceExamplesAction, deleteVoiceExampleAction } from "@/app/actions/voice";
import { PlatformChip } from "@/components/harpy/platform-chip";
import { showRequestError } from "@/components/harpy/show-request-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { isSocialPlatform, type SocialPlatform } from "@/lib/drafts/types";
import type { VoiceExample } from "@/lib/voice/store";
import { STUDIO_ACTION_FAILED_MESSAGE } from "../../_components/studio/use-studio-snapshot";

const PLATFORM_OPTIONS: readonly { readonly value: "any" | SocialPlatform; readonly label: string }[] = [
  { value: "any", label: "Any" },
  { value: "x", label: "X" },
  { value: "linkedin", label: "LinkedIn" },
  { value: "threads", label: "Threads" },
];

const PREVIEW_LINES = 3;

function previewText(text: string): string {
  return text.split(/\r?\n/).slice(0, PREVIEW_LINES).join("\n");
}

// Pasted past posts, tagged with a platform, and the list of what is saved.
export function ExamplesPanel({
  examples,
  refresh,
}: {
  readonly examples: readonly VoiceExample[];
  readonly refresh: () => Promise<void>;
}) {
  const [platform, setPlatform] = useState<"any" | SocialPlatform>("any");
  const [raw, setRaw] = useState("");
  const [adding, setAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function add() {
    if (adding || raw.trim() === "") return;
    setAdding(true);

    try {
      const result = await addVoiceExamplesAction({ platform: platform === "any" ? null : platform, raw });

      if (result.ok) {
        setRaw("");
      } else {
        showRequestError(result.message);
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setAdding(false);
    }
  }

  async function remove(id: string) {
    if (deletingId) return;
    setDeletingId(id);

    try {
      const result = await deleteVoiceExampleAction({ id });

      if (!result.ok) showRequestError("Could not delete that example.");
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setDeletingId(null);
    }
  }

  return (
    <Card className="gap-4 p-4">
      <h2 className="text-heading text-foreground">Example posts</h2>
      <ToggleGroup
        aria-label="Platform"
        className="flex-wrap"
        disabled={adding}
        onValueChange={(value) => {
          // An empty value means the active item was clicked again; keep it.
          if (value === "any" || isSocialPlatform(value)) setPlatform(value);
        }}
        size="sm"
        spacing={1}
        type="single"
        value={platform}
        variant="outline"
      >
        {PLATFORM_OPTIONS.map((option) => (
          <ToggleGroupItem key={option.value} value={option.value}>
            {option.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <textarea
        aria-label="Example posts"
        className="min-h-32 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-shadow outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 read-only:opacity-60 md:text-body dark:bg-input/30"
        onChange={(event) => setRaw(event.target.value)}
        placeholder="Paste past posts. Put a line with only --- between posts."
        readOnly={adding}
        rows={5}
        value={raw}
      />
      <div>
        <Button disabled={adding || raw.trim() === ""} onClick={() => void add()} size="sm" type="button">
          {adding ? "Adding..." : "Add posts"}
        </Button>
      </div>
      {examples.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {examples.map((example) => (
            <li className="flex items-start gap-3 rounded-md border border-border p-3" key={example.id}>
              <div className="flex min-w-0 flex-1 flex-col items-start gap-2">
                {example.platform ? (
                  <PlatformChip platform={example.platform} />
                ) : (
                  <span className="inline-flex h-6 items-center rounded-full bg-muted px-2 text-meta font-medium text-foreground">
                    Any
                  </span>
                )}
                <p className="text-small whitespace-pre-line text-foreground">{previewText(example.text)}</p>
              </div>
              <Button
                aria-label="Delete example"
                disabled={deletingId !== null}
                onClick={() => void remove(example.id)}
                size="icon-sm"
                type="button"
                variant="ghost"
              >
                <Trash2Icon />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </Card>
  );
}
