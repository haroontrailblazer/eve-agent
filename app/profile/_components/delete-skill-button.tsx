"use client";

import { useState, useTransition } from "react";
import { Loader2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { deleteSkillAction } from "@/app/actions/skills";

export function DeleteSkillButton({
  name,
  slug,
}: {
  readonly name: string;
  readonly slug: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <button
        className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
        onClick={() => setConfirming(true)}
        type="button"
      >
        Delete
      </button>
    );
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        aria-label={`Confirm delete ${name}`}
        className="inline-flex items-center gap-1 rounded-md bg-destructive/90 px-2 py-1 text-xs font-medium text-white transition-colors hover:bg-destructive disabled:opacity-60"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            await deleteSkillAction(slug);
            router.refresh();
          })
        }
        type="button"
      >
        {pending ? <Loader2Icon className="size-3 animate-spin" /> : null}
        {pending ? "Removing" : "Confirm"}
      </button>
      <button
        className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        disabled={pending}
        onClick={() => setConfirming(false)}
        type="button"
      >
        Cancel
      </button>
    </div>
  );
}
