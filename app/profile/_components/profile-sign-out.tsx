"use client";

import { useState } from "react";
import { Loader2Icon, LogOutIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function ProfileSignOut({ userId }: { readonly userId: string }) {
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = () => {
    if (signingOut) {
      return;
    }

    setSigningOut(true);
    void authClient
      .signOut()
      .then(() => {
        router.replace("/");
        router.refresh();
      })
      .catch(() => {
        setSigningOut(false);
      });
  };

  return (
    <>
      <button
        aria-busy={signingOut}
        className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3.5 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted/60 disabled:opacity-60"
        disabled={signingOut}
        onClick={handleSignOut}
        type="button"
      >
        {signingOut ? (
          <Loader2Icon className="size-4 animate-spin" />
        ) : (
          <LogOutIcon className="size-4" />
        )}
        {signingOut ? "Signing out…" : "Sign out"}
      </button>

      {signingOut ? (
        <div
          aria-live="assertive"
          className="fixed top-4 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm rounded-lg border border-border bg-popover p-3.5 shadow-lg"
          role="status"
        >
          <p className="text-sm font-medium text-foreground">Signing you out…</p>
          <p className="mt-1 text-xs text-muted-foreground">Signed-in ID</p>
          <code className="mt-0.5 block truncate font-mono text-xs text-foreground">{userId}</code>
        </div>
      ) : null}
    </>
  );
}
