import type { ReactNode } from "react";

export function PageHeader({
  actions,
  description,
  leading,
  title,
}: {
  readonly title: string;
  readonly description?: string;
  readonly actions?: ReactNode;
  readonly leading?: ReactNode;
}) {
  return (
    <header className="flex items-start gap-3">
      {leading}
      <div className="min-w-0 flex-1">
        <h1 className="text-title text-foreground">{title}</h1>
        {description ? <p className="mt-1 text-body text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
