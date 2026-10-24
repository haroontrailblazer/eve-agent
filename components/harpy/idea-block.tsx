import type { ReactNode } from "react";

// An idea with where it came from, and the drafts it produced as children.
export function IdeaBlock({
  children,
  sourceLabel,
  text,
}: {
  readonly children: ReactNode;
  readonly sourceLabel: string;
  readonly text: string;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <p className="text-meta text-muted-foreground">{sourceLabel}</p>
        <p className="text-heading text-foreground">{text}</p>
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </section>
  );
}
