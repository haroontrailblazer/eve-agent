import type { VoiceExample, VoiceGuide, VoicePreference } from "@/lib/voice/store";

// Pure helpers for the Brand voice page. Type-only imports keep the database
// client out of the browser bundle.

export type BrandVoiceSnapshot = {
  readonly guide: VoiceGuide;
  readonly versions: readonly VoiceGuide[];
  readonly examples: readonly VoiceExample[];
  readonly preferences: readonly VoicePreference[];
  readonly timezone: string;
};

export const REWRITE_MIN_EXAMPLES = 3;

export function canRewriteGuide(snapshot: BrandVoiceSnapshot): boolean {
  return snapshot.examples.length >= REWRITE_MIN_EXAMPLES;
}

const SOURCE_LABELS: Record<VoiceGuide["source"], string> = {
  default: "starter",
  manual: "by you",
  harpy: "by harpy",
  restore: "restored",
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// The date is in UTC because the label takes no time zone.
export function versionLabel(guide: VoiceGuide): string {
  return `Version ${guide.version} · ${SOURCE_LABELS[guide.source]} · ${dateFormat.format(new Date(guide.createdAt))}`;
}

export function guideChangedSince(previous: number, snapshot: BrandVoiceSnapshot): boolean {
  return snapshot.guide.version > previous;
}
