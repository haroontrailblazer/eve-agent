import { PlatformIcon, PLATFORM_TEXT_CLASS } from "@/components/harpy/platform-icon";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

// `detail` follows the label after a middle dot, e.g. "X · thread".
export function PlatformChip({
  detail,
  platform,
}: {
  readonly detail?: string;
  readonly platform: PlatformKey;
}) {
  const label = PLATFORMS[platform].label;

  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 text-meta font-medium text-foreground">
      <PlatformIcon className={cn("size-3", PLATFORM_TEXT_CLASS[platform])} platform={platform} />
      {detail ? `${label} · ${detail}` : label}
    </span>
  );
}
