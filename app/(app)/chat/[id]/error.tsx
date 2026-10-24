"use client";

import { MessageSquareWarningIcon } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { EmptyState } from "@/components/harpy/empty-state";
import { Button } from "@/components/ui/button";

// The chat route's error boundary. A chat that throws while it renders shows
// this instead of taking the whole page down.
export default function ChatError({
  error,
  unstable_retry: retry,
}: {
  readonly error: Error & { readonly digest?: string };
  // Next 16 re-fetches and re-renders the segment. It replaces reset(), which
  // only re-renders, so a server error would throw again.
  readonly unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-6">
      <div className="w-full max-w-md">
        <EmptyState
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button onClick={() => retry()} size="sm" type="button">
                Try again
              </Button>
              <Button asChild size="sm" variant="outline">
                <Link href="/chat">New chat</Link>
              </Button>
            </div>
          }
          description="Something went wrong while loading it. Try again, or start a new chat."
          icon={MessageSquareWarningIcon}
          title="This chat can't be shown right now."
        />
      </div>
    </div>
  );
}
