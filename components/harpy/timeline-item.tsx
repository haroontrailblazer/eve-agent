import { PlatformIcon, PLATFORM_TEXT_CLASS } from "@/components/harpy/platform-icon";
import { StatusGlyph } from "@/components/harpy/status-glyph";
import { DRAFT_STATUS_META, type DraftStatus } from "@/lib/draft-status";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

export function TimelineItem({
  platform,
  status,
  time,
  title,
}: {
  readonly time: string;
  readonly title: string;
  readonly platform: PlatformKey;
  readonly status: DraftStatus;
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className="w-20 shrink-0 text-meta text-muted-foreground tabular-nums">{time}</span>
      <PlatformIcon
        className={cn("size-4 shrink-0", PLATFORM_TEXT_CLASS[platform])}
        platform={platform}
      />
      <span className="sr-only">{PLATFORMS[platform].label}</span>
      <span className="min-w-0 flex-1 truncate text-small text-foreground">{title}</span>
      <StatusGlyph status={status} />
      <span className="sr-only">{DRAFT_STATUS_META[status].label}</span>
    </div>
  );
}
