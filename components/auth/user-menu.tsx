import { ChevronRightIcon } from "lucide-react";
import Link from "next/link";
import { HarpyMarkIcon } from "@/components/icons";
import type { Viewer } from "@/lib/chat/types";

export function UserMenu({ viewer }: { readonly viewer: Viewer }) {
  return (
    <Link
      aria-label="Open your profile"
      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      href="/profile"
    >
      <UserAvatar viewer={viewer} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium text-foreground">{viewer.name}</span>
        <span className="block truncate text-[11px] text-muted-foreground">{viewer.email}</span>
      </span>
      <ChevronRightIcon className="size-3.5 text-muted-foreground" />
    </Link>
  );
}

function UserAvatar({ viewer }: { readonly viewer: Viewer }) {
  if (viewer.image) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        className="size-7 rounded-md border border-border object-cover"
        src={viewer.image}
      />
    );
  }

  return (
    <span className="flex size-7 items-center justify-center rounded-md border border-border bg-background">
      <HarpyMarkIcon className="size-4 text-muted-foreground" />
    </span>
  );
}
