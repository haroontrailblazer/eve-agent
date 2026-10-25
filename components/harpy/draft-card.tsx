import { TriangleAlertIcon } from "lucide-react";
import type { ReactNode } from "react";
import { KbdHint } from "@/components/harpy/kbd-hint";
import { PlatformChip } from "@/components/harpy/platform-chip";
import { StatusChip } from "@/components/harpy/status-chip";
import { WorkingIndicator } from "@/components/harpy/working-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DraftStatus } from "@/lib/draft-status";
import type { PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

// A platform draft with its status, text, image, meta line and the review
// actions it was given. `children`, when present, takes the place of the text
// and image (the edit mode). `isBusy` disables the actions while one runs.
export function DraftCard({
  children,
  imageUrl,
  isBusy = false,
  isSelected = false,
  isWorking = false,
  meta,
  notice,
  onApprove,
  onEdit,
  onRestore,
  onSkip,
  platform,
  scheduledLabel,
  status,
  text,
  warnings,
  workingLabel = "harpy is refining",
}: {
  readonly platform: PlatformKey;
  readonly status: DraftStatus;
  readonly text: string;
  readonly imageUrl?: string;
  readonly meta: string;
  readonly scheduledLabel?: string;
  readonly warnings?: readonly string[];
  readonly notice?: string;
  readonly isWorking?: boolean;
  readonly workingLabel?: string;
  readonly isSelected?: boolean;
  readonly isBusy?: boolean;
  readonly onApprove?: () => void;
  readonly onEdit?: () => void;
  readonly onSkip?: () => void;
  readonly onRestore?: () => void;
  readonly children?: ReactNode;
}) {
  const hasActions = Boolean(onApprove || onEdit || onSkip || onRestore);

  return (
    <Card
      aria-current={isSelected ? "true" : undefined}
      className={cn("gap-3 p-4 shadow-raised", isSelected && "ring-2 ring-ring")}
      data-selected={isSelected ? "true" : undefined}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform={platform} />
        <StatusChip status={status} />
        {scheduledLabel ? (
          <span className="text-meta text-muted-foreground">{scheduledLabel}</span>
        ) : null}
      </div>
      {children ?? (
        <>
          <p className="whitespace-pre-wrap text-body text-foreground">{text}</p>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- draft images are hosted blobs of unknown size
            <img
              alt=""
              className="max-h-64 w-full rounded-md border border-border object-cover"
              src={imageUrl}
            />
          ) : null}
        </>
      )}
      <p className="text-meta text-muted-foreground">{meta}</p>
      {warnings && warnings.length > 0 ? (
        <ul aria-label="Warnings" className="flex flex-col gap-1">
          {warnings.map((warning, index) => (
            // Lint can repeat a message, so the position keeps keys unique.
            <li className="flex items-start gap-1.5 text-small text-muted-foreground" key={`${index}:${warning}`}>
              <TriangleAlertIcon aria-hidden="true" className="mt-0.5 size-3.5 shrink-0 text-status-review" />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {notice ? <p className="text-small text-muted-foreground">{notice}</p> : null}
      {isWorking ? <WorkingIndicator label={workingLabel} /> : null}
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2">
          {onApprove ? (
            <Button disabled={isBusy} onClick={onApprove} size="sm" type="button">
              Approve
              {isSelected ? <KbdHint keys={["A"]} /> : null}
            </Button>
          ) : null}
          {onEdit ? (
            <Button disabled={isBusy} onClick={onEdit} size="sm" type="button" variant="outline">
              Edit
              {isSelected ? <KbdHint keys={["E"]} /> : null}
            </Button>
          ) : null}
          {onSkip ? (
            <Button disabled={isBusy} onClick={onSkip} size="sm" type="button" variant="ghost">
              Skip
              {isSelected ? <KbdHint keys={["S"]} /> : null}
            </Button>
          ) : null}
          {onRestore ? (
            <Button disabled={isBusy} onClick={onRestore} size="sm" type="button" variant="ghost">
              Restore
            </Button>
          ) : null}
        </div>
      ) : null}
    </Card>
  );
}
