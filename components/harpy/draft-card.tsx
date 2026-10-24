import { KbdHint } from "@/components/harpy/kbd-hint";
import { PlatformChip } from "@/components/harpy/platform-chip";
import { StatusChip } from "@/components/harpy/status-chip";
import { WorkingIndicator } from "@/components/harpy/working-indicator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DraftStatus } from "@/lib/draft-status";
import type { PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export function DraftCard({
  imageUrl,
  isSelected = false,
  isWorking = false,
  meta,
  onApprove,
  onEdit,
  onSkip,
  platform,
  scheduledLabel,
  status,
  text,
}: {
  readonly platform: PlatformKey;
  readonly status: DraftStatus;
  readonly text: string;
  readonly imageUrl?: string;
  readonly meta: string;
  readonly scheduledLabel?: string;
  readonly isWorking?: boolean;
  readonly isSelected?: boolean;
  readonly onApprove?: () => void;
  readonly onEdit?: () => void;
  readonly onSkip?: () => void;
}) {
  return (
    <Card
      aria-current={isSelected ? "true" : undefined}
      className={cn("gap-3 p-4 shadow-raised", isSelected && "ring-2 ring-ring")}
    >
      <div className="flex flex-wrap items-center gap-2">
        <PlatformChip platform={platform} />
        <StatusChip status={status} />
        {scheduledLabel ? (
          <span className="text-meta text-muted-foreground">{scheduledLabel}</span>
        ) : null}
      </div>
      <p className="whitespace-pre-wrap text-body text-foreground">{text}</p>
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- draft images are hosted blobs of unknown size
        <img
          alt=""
          className="max-h-64 w-full rounded-md border border-border object-cover"
          src={imageUrl}
        />
      ) : null}
      <p className="text-meta text-muted-foreground">{meta}</p>
      {isWorking ? <WorkingIndicator label="harpy is refining" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        {onApprove ? (
          <Button onClick={onApprove} size="sm" type="button">
            Approve
            {isSelected ? <KbdHint keys={["A"]} /> : null}
          </Button>
        ) : null}
        {onEdit ? (
          <Button onClick={onEdit} size="sm" type="button" variant="outline">
            Edit
            {isSelected ? <KbdHint keys={["E"]} /> : null}
          </Button>
        ) : null}
        {onSkip ? (
          <Button onClick={onSkip} size="sm" type="button" variant="ghost">
            Skip
            {isSelected ? <KbdHint keys={["S"]} /> : null}
          </Button>
        ) : null}
      </div>
    </Card>
  );
}
