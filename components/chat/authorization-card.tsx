"use client";

import type { EveAuthorizationPart } from "eve/react";
import { ExternalLinkIcon, PlugIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

// The sign-in prompt for a connection the turn is waiting on. "Skip" cancels
// the turn, which the caller wires to onSkip.
export function AuthorizationCard({
  isSkipping,
  onSkip,
  part,
}: {
  readonly isSkipping: boolean;
  readonly onSkip: () => void;
  readonly part: EveAuthorizationPart;
}) {
  const url = part.authorization?.url;
  const userCode = part.authorization?.userCode;

  return (
    <article aria-live="polite" className="flex w-full justify-start px-3">
      <div className="w-full max-w-md rounded-lg border border-border/70 bg-muted/20 p-3 text-sm shadow-sm">
        <div className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-background text-muted-foreground">
            <PlugIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">Connect {part.displayName}</p>
            <p className="mt-1 text-muted-foreground">
              {part.authorization?.instructions ?? part.description}
            </p>
            {userCode ? (
              <p className="mt-1.5 text-muted-foreground">
                Code: <span className="font-mono text-foreground">{userCode}</span>
              </p>
            ) : null}
            <div className="mt-2.5 flex items-center gap-2">
              {url ? (
                <Button asChild size="xs" type="button">
                  <a href={url} rel="noreferrer" target="_blank">
                    Connect
                    <ExternalLinkIcon className="size-3" />
                  </a>
                </Button>
              ) : null}
              <Button
                disabled={isSkipping}
                onClick={onSkip}
                size="xs"
                type="button"
                variant="outline"
              >
                {isSkipping ? "Skipping..." : "Skip"}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}
