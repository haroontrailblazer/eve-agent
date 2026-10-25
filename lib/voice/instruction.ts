import type { VoiceGuide } from "@/lib/voice/store";

export function formatVoiceGuideInstruction(guide: VoiceGuide): string {
  return `# Brand voice guide (version ${guide.version})\n\n${guide.body}\n\nWrite everything for the owner in this voice.`;
}
