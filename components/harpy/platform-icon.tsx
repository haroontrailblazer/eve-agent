import type { ComponentType } from "react";
import { BookOpenIcon } from "lucide-react";
import {
  LinearIcon,
  LinkedInIcon,
  NotionIcon,
  SentryIcon,
  SlackIcon,
  ThreadsIcon,
  WhatsAppIcon,
  XBrandIcon,
} from "@/components/icons";
import type { PlatformKey } from "@/lib/platforms";

type IconComponent = ComponentType<{ readonly className?: string }>;

// The glyph for each platform key. Labels and colors live in lib/platforms.ts;
// this is the only place that pairs a key with its icon.
export const PLATFORM_ICONS: Readonly<Record<PlatformKey, IconComponent>> = {
  x: XBrandIcon,
  linkedin: LinkedInIcon,
  threads: ThreadsIcon,
  whatsapp: WhatsAppIcon,
  slack: SlackIcon,
  notion: NotionIcon,
  linear: LinearIcon,
  sentry: SentryIcon,
  deepwiki: BookOpenIcon,
};

// Tailwind classes that color a platform glyph from its token. Connections have
// no token and stay neutral. Written out in full so Tailwind can see them.
export const PLATFORM_TEXT_CLASS: Readonly<Record<PlatformKey, string>> = {
  x: "text-platform-x",
  linkedin: "text-platform-linkedin",
  threads: "text-platform-threads",
  whatsapp: "text-platform-whatsapp",
  slack: "text-platform-slack",
  notion: "text-foreground",
  linear: "text-foreground",
  sentry: "text-foreground",
  deepwiki: "text-foreground",
};

export function PlatformIcon({
  className,
  platform,
}: {
  readonly className?: string;
  readonly platform: PlatformKey;
}) {
  const Icon = PLATFORM_ICONS[platform];

  return <Icon className={className} />;
}
