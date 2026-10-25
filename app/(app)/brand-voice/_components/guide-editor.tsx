import { useEffect, useRef, useState } from "react";
import { requestGuideRewriteAction, restoreVoiceGuideAction, saveVoiceGuideAction } from "@/app/actions/voice";
import { ConfirmActionButton } from "@/components/harpy/confirm-action-button";
import { showRequestError } from "@/components/harpy/show-request-error";
import { WorkingIndicator } from "@/components/harpy/working-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { startHarpyRun } from "@/lib/studio/start-run";
import { canRewriteGuide, guideChangedSince, versionLabel, type BrandVoiceSnapshot } from "@/lib/voice/view";
import { STUDIO_ACTION_FAILED_MESSAGE } from "../../_components/studio/use-studio-snapshot";

const REWRITE_POLL_MS = 5_000;
const REWRITE_LIMIT_MS = 5 * 60_000;
const REWRITE_TIMEOUT_MESSAGE = "harpy didn't finish. Try again.";
const REWRITE_START_FAILED_MESSAGE = "harpy couldn't start the rewrite. Try again.";
const REWRITE_TOOLTIP = "Add at least 3 example posts first.";

// The active guide, a Save that is off until the text changes, a rewrite from
// the saved examples, and the version history.
export function GuideEditor({
  refresh,
  snapshot,
}: {
  readonly snapshot: BrandVoiceSnapshot;
  readonly refresh: () => Promise<void>;
}) {
  const { guide, versions } = snapshot;
  const [text, setText] = useState(guide.body);
  const [syncedVersion, setSyncedVersion] = useState(guide.version);
  const [saving, setSaving] = useState(false);
  const [starting, setStarting] = useState(false);
  // The version the rewrite started from, while one is running.
  const [rewritingFrom, setRewritingFrom] = useState<number | null>(null);
  const refreshRef = useRef(refresh);

  useEffect(() => {
    refreshRef.current = refresh;
  });

  // A newer guide (saved, restored or rewritten) replaces the text.
  if (syncedVersion !== guide.version) {
    setSyncedVersion(guide.version);
    setText(guide.body);
  }

  // The rewrite is done as soon as a newer version shows up.
  if (rewritingFrom !== null && guideChangedSince(rewritingFrom, snapshot)) {
    setRewritingFrom(null);
  }

  // Polls every 5 seconds, gives up after 5 minutes, and stops on unmount.
  useEffect(() => {
    if (rewritingFrom === null) return;

    const poll = window.setInterval(() => void refreshRef.current(), REWRITE_POLL_MS);
    const giveUp = window.setTimeout(() => {
      setRewritingFrom(null);
      showRequestError(REWRITE_TIMEOUT_MESSAGE);
    }, REWRITE_LIMIT_MS);

    return () => {
      window.clearInterval(poll);
      window.clearTimeout(giveUp);
    };
  }, [rewritingFrom]);

  const changed = text.trim() !== guide.body.trim();
  const rewriting = rewritingFrom !== null;
  const canRewrite = canRewriteGuide(snapshot);

  async function save() {
    if (saving || !changed) return;
    setSaving(true);

    try {
      const result = await saveVoiceGuideAction({ body: text, basedOnVersion: guide.version });

      if (!result.ok) showRequestError(result.message);
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setSaving(false);
    }
  }

  async function rewrite() {
    if (starting || rewriting) return;
    setStarting(true);

    try {
      const result = await requestGuideRewriteAction();

      if (!result.ok) {
        showRequestError(result.message);
        return;
      }

      try {
        await startHarpyRun(result.message);
        setRewritingFrom(guide.version);
      } catch {
        showRequestError(REWRITE_START_FAILED_MESSAGE);
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      setStarting(false);
    }
  }

  async function restore(version: number) {
    try {
      const result = await restoreVoiceGuideAction({ version });

      if (!result.ok) throw new Error(result.message);
    } finally {
      await refresh();
    }
  }

  return (
    <Card className="gap-4 p-4">
      <h2 className="text-heading text-foreground">Guide</h2>
      <textarea
        aria-label="Voice guide"
        className="min-h-64 w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-xs transition-shadow outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-body dark:bg-input/30"
        onChange={(event) => setText(event.target.value)}
        value={text}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button disabled={!changed || saving || text.trim() === ""} onClick={() => void save()} size="sm" type="button">
          {saving ? "Saving..." : "Save"}
        </Button>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex" tabIndex={canRewrite ? undefined : 0}>
              <Button
                disabled={!canRewrite || starting || rewriting}
                onClick={() => void rewrite()}
                size="sm"
                type="button"
                variant="outline"
              >
                Rewrite from my examples
              </Button>
            </span>
          </TooltipTrigger>
          {canRewrite ? null : <TooltipContent>{REWRITE_TOOLTIP}</TooltipContent>}
        </Tooltip>
        {rewriting ? <WorkingIndicator label="harpy is rewriting your guide" /> : null}
      </div>
      <div className="flex flex-col gap-2">
        <h3 className="text-small font-medium text-foreground">Version history</h3>
        <ul className="flex flex-col gap-2">
          {versions.map((version) => (
            <li className="flex items-center justify-between gap-3" key={version.id}>
              <span className="text-small text-muted-foreground">{versionLabel(version)}</span>
              {version.version === guide.version ? null : (
                <ConfirmActionButton
                  confirmBody={`This saves version ${version.version} as your newest guide.`}
                  confirmLabel="Restore"
                  confirmTitle={`Restore version ${version.version}?`}
                  label="Restore"
                  onConfirm={() => restore(version.version)}
                  pendingLabel="Restoring..."
                  variant="outline"
                />
              )}
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}
