"use client";

import { MicIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState } from "@/components/harpy/empty-state";
import { PageHeader } from "@/components/harpy/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import type { BrandVoiceSnapshot } from "@/lib/voice/view";
import { ExamplesPanel } from "./examples-panel";
import { GuideEditor } from "./guide-editor";
import { PreferencesPanel } from "./preferences-panel";

const SIGNED_OUT_MESSAGE = "Sign in to see your brand voice.";
const LOAD_FAILED_MESSAGE = "Couldn't load your brand voice.";

// The snapshot from GET /api/brand-voice. It loads on mount, on window focus
// and whenever refresh() is called. A response never replaces one from a
// request that started later. A failed load keeps the last snapshot.
function useBrandVoiceSnapshot(): {
  readonly snapshot: BrandVoiceSnapshot | null;
  readonly error: string | null;
  refresh(): Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<BrandVoiceSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(0);
  const appliedRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++startedRef.current;

    const apply = (next: { readonly snapshot: BrandVoiceSnapshot } | { readonly error: string }) => {
      if (request < appliedRef.current) return;
      appliedRef.current = request;

      if ("snapshot" in next) {
        setSnapshot(next.snapshot);
        setError(null);
      } else {
        setError(next.error);
      }
    };

    try {
      const response = await fetch("/api/brand-voice", { cache: "no-store" });

      if (!response.ok) {
        apply({ error: response.status === 401 ? SIGNED_OUT_MESSAGE : LOAD_FAILED_MESSAGE });
        return;
      }

      apply({ snapshot: (await response.json()) as BrandVoiceSnapshot });
    } catch {
      apply({ error: LOAD_FAILED_MESSAGE });
    }
  }, []);

  useEffect(() => {
    void refresh();

    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);

    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return { snapshot, error, refresh };
}

export function BrandVoiceView() {
  const { snapshot, error, refresh } = useBrandVoiceSnapshot();

  return (
    <>
      <PageHeader
        description="Teach harpy how you write. It uses your guide, examples and preferences in every draft."
        title="Brand voice"
      />
      {snapshot ? (
        <div className="flex flex-col gap-6">
          <GuideEditor refresh={refresh} snapshot={snapshot} />
          <ExamplesPanel examples={snapshot.examples} refresh={refresh} />
          <PreferencesPanel preferences={snapshot.preferences} refresh={refresh} />
        </div>
      ) : error ? (
        <EmptyState description={error} icon={MicIcon} title="Brand voice is unavailable" />
      ) : (
        <Skeleton className="h-64 w-full" />
      )}
    </>
  );
}
