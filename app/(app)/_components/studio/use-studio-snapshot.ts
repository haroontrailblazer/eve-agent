import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioSnapshot } from "@/lib/studio/types";
import { needsPolling } from "@/lib/studio/view-model";

export const STUDIO_POLL_MS = 4_000;
export const STUDIO_SIGNED_OUT_MESSAGE = "Sign in to see your drafts.";
// Shown when a server action throws instead of returning a failure.
export const STUDIO_ACTION_FAILED_MESSAGE = "Something went wrong.";
const LOAD_FAILED_MESSAGE = "Couldn't load Studio.";

// The Studio snapshot from GET /api/studio. It loads on mount, again whenever
// the window gets focus and whenever refresh() is called (after every action),
// and every 4 seconds while a draft is being written or revised. A response
// never replaces one from a request that started later, so a slow poll cannot
// undo a newer refresh. A failed load keeps the last snapshot and sets error.
export function useStudioSnapshot(): {
  readonly snapshot: StudioSnapshot | null;
  readonly error: string | null;
  refresh(): Promise<void>;
} {
  const [snapshot, setSnapshot] = useState<StudioSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(0);
  const appliedRef = useRef(0);
  const inFlightRef = useRef(0);

  const refresh = useCallback(async () => {
    const request = ++startedRef.current;
    inFlightRef.current += 1;

    // Applies the outcome only if no later request has applied one already.
    const apply = (next: { readonly snapshot: StudioSnapshot } | { readonly error: string }) => {
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
      const response = await fetch("/api/studio", { cache: "no-store" });

      if (!response.ok) {
        apply({ error: response.status === 401 ? STUDIO_SIGNED_OUT_MESSAGE : LOAD_FAILED_MESSAGE });
        return;
      }

      apply({ snapshot: (await response.json()) as StudioSnapshot });
    } catch {
      apply({ error: LOAD_FAILED_MESSAGE });
    } finally {
      inFlightRef.current -= 1;
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

  // Signed out, the last snapshot is stale and polling would only repeat 401s.
  const polling =
    snapshot !== null &&
    error !== STUDIO_SIGNED_OUT_MESSAGE &&
    needsPolling(snapshot, new Date(snapshot.now));

  useEffect(() => {
    if (!polling) return;

    // A tick is skipped while another load is still out, so slow responses
    // never pile up.
    const timer = window.setInterval(() => {
      if (inFlightRef.current === 0) void refresh();
    }, STUDIO_POLL_MS);

    return () => {
      window.clearInterval(timer);
    };
  }, [polling, refresh]);

  return { snapshot, error, refresh };
}
