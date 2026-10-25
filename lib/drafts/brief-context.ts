import { getBrandSettings } from "@/lib/db/brands";
import type { DraftTarget } from "@/lib/drafts/types";
import type { WriterBrief } from "@/lib/drafts/writer";
import { isValidTimeZone } from "@/lib/time-zone";
import { selectExemplars } from "@/lib/voice/exemplars";
import { getActiveVoiceGuide, listVoiceExamples, listVoicePreferences, type VoiceExample } from "@/lib/voice/store";

// The brand-level half of a writer brief, shared by drafting and revisions.
// It reads the database, so call it only from inside a "use step" body.

const EXEMPLARS_PER_TARGET = 4;
const PREFERENCES_LIMIT = 30;
const EXAMPLES_LIMIT = 100;

export type BriefContext = {
  readonly now: string;
  readonly timezone: string;
  readonly voiceGuide: string;
  readonly preferences: readonly string[];
  readonly examples: readonly VoiceExample[];
};

export async function loadBriefContext(brandId: string): Promise<BriefContext> {
  const [settings, guide, preferences, examples] = await Promise.all([
    getBrandSettings(brandId),
    getActiveVoiceGuide(brandId),
    listVoicePreferences(brandId, PREFERENCES_LIMIT),
    listVoiceExamples(brandId, EXAMPLES_LIMIT),
  ]);
  // buildWriterMessage formats "now" in this zone and throws on a bad one.
  const zone = settings?.timezone ?? "UTC";
  return {
    now: new Date().toISOString(),
    timezone: isValidTimeZone(zone) ? zone : "UTC",
    voiceGuide: guide.body,
    preferences: preferences.map((preference) => preference.text),
    examples,
  };
}

export function exemplarsFor(
  examples: readonly VoiceExample[],
  target: DraftTarget,
  ideaText: string,
): WriterBrief["exemplars"] {
  return selectExemplars(examples, {
    text: ideaText,
    platform: target.kind === "post" ? target.platform : null,
    limit: EXEMPLARS_PER_TARGET,
  }).map((example) => ({ platform: example.platform, text: example.text }));
}
