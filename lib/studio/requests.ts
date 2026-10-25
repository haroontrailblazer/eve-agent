import type { SocialPlatform } from "@/lib/drafts/types";
import { PLATFORMS } from "@/lib/platforms";

export const STUDIO_REQUEST_PREFIX = "Studio request:";

const MAX_LINKS = 3;
const TRAILING_PUNCTUATION = /[.,)!?;:]+$/;

// http(s) links in prose, without the punctuation that follows them, deduped,
// at most 3.
export function extractLinks(text: string): string[] {
  const links: string[] = [];

  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/g)) {
    const url = match[0].replace(TRAILING_PUNCTUATION, "");

    if (url !== "" && !links.includes(url)) {
      links.push(url);
    }

    if (links.length === MAX_LINKS) {
      break;
    }
  }

  return links;
}

// The idea text is not repeated: draft_posts reads it from the saved idea.
export function buildDraftIdeaRequest(input: { readonly ideaId: string; readonly ideaText: string }): string {
  const links = extractLinks(input.ideaText);
  const sentences = [
    STUDIO_REQUEST_PREFIX,
    `Draft idea ${input.ideaId}.`,
    `Call draft_posts with ideaId "${input.ideaId}"; the idea's text and requested platforms are saved with it.`,
  ];

  if (links.length > 0) {
    sentences.push(
      `First read these links with web_fetch and pass each article's text as a source: ${links.join(" ")}.`,
    );
  }

  sentences.push("Do not write the drafts yourself. When the tool finishes, reply with one short line.");
  return sentences.join(" ");
}

export function buildRevisionRequest(input: {
  readonly draftId: string;
  readonly platform: SocialPlatform;
  readonly instruction: string;
}): string {
  return [
    STUDIO_REQUEST_PREFIX,
    `Revise the ${PLATFORMS[input.platform].label} draft ${input.draftId}.`,
    `Call revise_draft with draftId "${input.draftId}" and this change: <change>${input.instruction}</change>`,
    "Do not rewrite the draft yourself. When the tool finishes, reply with one short line.",
  ].join(" ");
}

export function buildRewriteGuideRequest(): string {
  return [
    STUDIO_REQUEST_PREFIX,
    "Rewrite the brand voice guide.",
    "Call list_voice_examples, write a new guide from those examples that keeps the default anti-AI rules, and save it with update_voice_guide.",
    "When the tool finishes, reply with one short line.",
  ].join(" ");
}
