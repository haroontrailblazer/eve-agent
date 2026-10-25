"use client";

import { LayoutDashboardIcon } from "lucide-react";
import { useCallback, useEffect, useEffectEvent, useMemo, useState, type ReactNode } from "react";
import { setBrandTimezoneAction } from "@/app/actions/studio";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { EmptyState } from "@/components/harpy/empty-state";
import { KbdHint } from "@/components/harpy/kbd-hint";
import { PageHeader } from "@/components/harpy/page-header";
import { showRequestError } from "@/components/harpy/show-request-error";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { keyToAction, moveSelection } from "@/lib/studio/keyboard";
import { canReview, selectableDraftIds } from "@/lib/studio/view-model";
import { IdeaComposer } from "./idea-composer";
import { IdeaItem } from "./idea-item";
import { KeyboardHelpDialog } from "./keyboard-help-dialog";
import { draftElementId, useDraftReview } from "./studio-draft";
import { StudioRail } from "./studio-rail";
import {
  STUDIO_ACTION_FAILED_MESSAGE,
  STUDIO_SIGNED_OUT_MESSAGE,
  useStudioSnapshot,
} from "./use-studio-snapshot";

// Keys pressed inside these belong to them (a dialog, a menu's typeahead).
const OWN_KEYS_SELECTOR = '[role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"]';

// Zone names that are UTC under another name, so offering them changes nothing.
const UTC_ALIASES = new Set(["UTC", "Etc/UTC", "Etc/GMT", "GMT", "Etc/Universal", "Etc/Zulu"]);

function browserTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

// The Studio: type an idea, watch its drafts arrive, and approve, edit or
// skip each one with the mouse or the keyboard (J and K move, A, E and S act
// on the selected draft, ? lists the shortcuts).
export function StudioView() {
  const { requestSignIn } = useChatShell();
  const { snapshot, error, refresh } = useStudioSnapshot();
  const { busyIds, review } = useDraftReview(refresh);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [helpOpen, setHelpOpen] = useState(false);
  const signedOut = error === STUDIO_SIGNED_OUT_MESSAGE;
  const now = useMemo(() => (snapshot ? new Date(snapshot.now) : null), [snapshot]);

  const setEditing = useCallback((draftId: string, editing: boolean) => {
    setEditingIds((current) => {
      if (current.has(draftId) === editing) return current;
      const next = new Set(current);

      if (editing) {
        next.add(draftId);
      } else {
        next.delete(draftId);
      }

      return next;
    });
  }, []);

  const handleKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (helpOpen) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest(OWN_KEYS_SELECTOR)) return;

    const action = keyToAction({
      key: event.key,
      metaKey: event.metaKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      target,
    });
    if (!action) return;

    if (action.type === "help") {
      event.preventDefault();
      setHelpOpen(true);
      return;
    }

    if (!snapshot || signedOut) return;
    event.preventDefault();

    if (action.type === "move") {
      const next = moveSelection(selectableDraftIds(snapshot), selectedId, action.delta);
      setSelectedId(next);
      if (next) document.getElementById(draftElementId(next))?.scrollIntoView({ block: "nearest" });
      return;
    }

    // The keys follow the buttons: they act only where the card shows that
    // button (so A does nothing while harpy revises the draft), and not while
    // its editor is open.
    const draft = snapshot.ideas.flatMap((idea) => idea.drafts).find((item) => item.id === selectedId);
    if (!draft || editingIds.has(draft.id) || !canReview(draft, action.type, new Date(snapshot.now))) return;

    if (action.type === "edit") {
      setEditing(draft.id, true);
    } else {
      void review(draft, action.type);
    }
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => handleKeyDown(event);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const zone = snapshot?.timezone === "UTC" ? browserTimeZone() : null;
  const offerZone = zone !== null && !UTC_ALIASES.has(zone) ? zone : null;

  let body: ReactNode;

  if (signedOut) {
    body = (
      <Card className="flex-row items-center justify-between gap-3 p-4">
        <p className="text-small text-muted-foreground">{STUDIO_SIGNED_OUT_MESSAGE}</p>
        <Button onClick={() => requestSignIn()} size="sm" type="button">
          Sign in
        </Button>
      </Card>
    );
  } else if (snapshot === null || now === null) {
    body = error ? (
      <LoadError message={error} onRetry={refresh} />
    ) : (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-1/2" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  } else {
    body = (
      <>
        {error ? <LoadError message={error} onRetry={refresh} /> : null}
        {snapshot.ideas.length === 0 ? (
          <EmptyState
            description="Type an idea above. harpy drafts it for X, LinkedIn and Threads."
            icon={LayoutDashboardIcon}
            title="Your drafts will live here"
          />
        ) : (
          <div className="flex flex-col gap-8">
            {snapshot.ideas.map((idea) => (
              <IdeaItem
                busyIds={busyIds}
                editingIds={editingIds}
                idea={idea}
                key={idea.id}
                now={now}
                onEditChange={setEditing}
                onReview={(draft, action) => void review(draft, action)}
                onSelect={setSelectedId}
                refresh={refresh}
                selectedId={selectedId}
                timezone={snapshot.timezone}
              />
            ))}
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <PageHeader
        actions={
          <Button
            aria-label="Show shortcuts"
            onClick={() => setHelpOpen(true)}
            size="sm"
            type="button"
            variant="ghost"
          >
            <KbdHint keys={["?"]} />
          </Button>
        }
        title="Studio"
      />
      {offerZone && !signedOut ? <TimezoneNotice refresh={refresh} zone={offerZone} /> : null}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <div className="flex min-w-0 flex-col gap-6">
          {signedOut ? null : <IdeaComposer refresh={refresh} />}
          {body}
        </div>
        <StudioRail
          timezone={snapshot?.timezone ?? "UTC"}
          upNext={signedOut ? [] : (snapshot?.upNext ?? null)}
        />
      </div>
      <KeyboardHelpDialog onOpenChange={setHelpOpen} open={helpOpen} />
    </>
  );
}

function LoadError({ message, onRetry }: { readonly message: string; readonly onRetry: () => Promise<void> }) {
  return (
    <Card className="flex-row items-center justify-between gap-3 p-4" role="alert">
      <p className="text-small text-muted-foreground">{message}</p>
      <Button onClick={() => void onRetry()} size="sm" type="button" variant="outline">
        Try again
      </Button>
    </Card>
  );
}

// Shown while the brand's zone is still the UTC default and the browser is
// elsewhere: one click saves the browser's zone as the brand's.
function TimezoneNotice({ refresh, zone }: { readonly zone: string; readonly refresh: () => Promise<void> }) {
  const [pending, setPending] = useState(false);

  async function applyZone() {
    if (pending) return;
    setPending(true);

    try {
      const result = await setBrandTimezoneAction({ timezone: zone });

      if (!result.ok) {
        showRequestError(result.message ?? STUDIO_ACTION_FAILED_MESSAGE);
      }
    } catch {
      showRequestError(STUDIO_ACTION_FAILED_MESSAGE);
    } finally {
      await refresh();
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-small text-muted-foreground">Times show in UTC.</p>
      <Button disabled={pending} onClick={() => void applyZone()} size="xs" type="button" variant="outline">
        Use {zone}
      </Button>
    </div>
  );
}
