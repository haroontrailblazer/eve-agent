import type { ReactNode } from "react";
import { TimelineItem } from "@/components/harpy/timeline-item";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toDisplayStatus } from "@/lib/drafts/state";
import type { StudioDraft } from "@/lib/studio/types";
import { formatLocalTime } from "@/lib/studio/view-model";

const TITLE_MAX_CHARS = 60;

// The first line of a draft, cut to 60 characters.
function firstLine(text: string): string {
  const line = text.split("\n").find((part) => part.trim() !== "") ?? "";
  return line.trim().slice(0, TITLE_MAX_CHARS);
}

// The right rail: the morning brief (a later stage) and the approved drafts
// coming up next. `upNext` is null while the snapshot loads.
export function StudioRail({
  timezone,
  upNext,
}: {
  readonly upNext: readonly StudioDraft[] | null;
  readonly timezone: string;
}) {
  return (
    <aside className="flex flex-col gap-4">
      <RailCard title="Morning brief">
        <CardDescription>Your daily brief arrives in a later stage.</CardDescription>
      </RailCard>
      <RailCard title="Up next">
        {upNext === null ? (
          <Skeleton className="h-10 w-full" />
        ) : upNext.length === 0 ? (
          <CardDescription>Approved drafts show up here.</CardDescription>
        ) : (
          <div className="flex flex-col">
            {upNext.map((draft) => (
              <TimelineItem
                key={draft.id}
                platform={draft.platform}
                status={toDisplayStatus(draft.status)}
                time={formatLocalTime(draft.scheduledAt ?? draft.approvedAt ?? draft.updatedAt, timezone)}
                title={firstLine(draft.text)}
              />
            ))}
          </div>
        )}
      </RailCard>
    </aside>
  );
}

function RailCard({ children, title }: { readonly title: string; readonly children: ReactNode }) {
  return (
    <Card className="gap-2 py-4">
      <CardHeader className="px-4">
        <CardTitle className="text-heading">{title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4">{children}</CardContent>
    </Card>
  );
}
