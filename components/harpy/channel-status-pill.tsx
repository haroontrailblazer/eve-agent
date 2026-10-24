import { PlatformIcon, PLATFORM_TEXT_CLASS } from "@/components/harpy/platform-icon";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";

type ChannelState = "connected" | "not_connected" | "needs_attention";

// The dot carries the state color; the pill surface stays neutral.
const STATE_META: Readonly<Record<ChannelState, { readonly label: string; readonly dot: string }>> = {
  connected: { label: "Connected", dot: "bg-status-posted" },
  not_connected: { label: "Not connected", dot: "bg-status-draft" },
  needs_attention: { label: "Needs attention", dot: "bg-status-failed" },
};

export function ChannelStatusPill({
  platform,
  state,
}: {
  readonly platform: PlatformKey;
  readonly state: ChannelState;
}) {
  const { dot, label } = STATE_META[state];

  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 text-meta font-medium text-foreground">
      <PlatformIcon className={cn("size-3", PLATFORM_TEXT_CLASS[platform])} platform={platform} />
      {PLATFORMS[platform].label}
      <span aria-hidden="true" className={cn("size-1.5 rounded-full", dot)} />
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
