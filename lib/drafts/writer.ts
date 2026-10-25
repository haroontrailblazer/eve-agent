import { z } from "zod";
import { PIECE_GUIDES } from "@/lib/content-guides/repurpose";
import { PLATFORM_GUIDES } from "@/lib/content-guides/platforms";
import type { LintIssue } from "@/lib/drafts/lint";
import { SOCIAL_PLATFORM_KEYS, type DraftTarget, type SocialPlatform } from "@/lib/drafts/types";
import { PLATFORMS } from "@/lib/platforms";

export const POST_OUTPUT_SCHEMA = z.object({
  platform: z.enum(SOCIAL_PLATFORM_KEYS),
  hook: z.string(),
  posts: z.array(z.string()).min(1).max(10),
  imagePrompt: z.string().nullable(),
  suggestedTime: z.string().nullable(),
  notes: z.string(),
});

export const REEL_OUTPUT_SCHEMA = z.object({
  title: z.string(),
  hook: z.string(),
  beats: z
    .array(z.object({ visual: z.string(), voiceover: z.string(), onScreenText: z.string() }))
    .min(3)
    .max(12),
  caption: z.string(),
  notes: z.string(),
});

export const CAROUSEL_OUTPUT_SCHEMA = z.object({
  title: z.string(),
  slides: z.array(z.object({ heading: z.string(), body: z.string() })).min(3).max(12),
  coverImagePrompt: z.string().nullable(),
  caption: z.string(),
  notes: z.string(),
});

export type PostOutput = z.infer<typeof POST_OUTPUT_SCHEMA>;
export type ReelOutput = z.infer<typeof REEL_OUTPUT_SCHEMA>;
export type CarouselOutput = z.infer<typeof CAROUSEL_OUTPUT_SCHEMA>;
export type WriterOutput = PostOutput | ReelOutput | CarouselOutput;

export type DraftSource = {
  readonly url: string | null;
  readonly title: string | null;
  readonly text: string;
};

export const MAX_SOURCES = 3;
export const SOURCE_TEXT_MAX_CHARS = 12_000;
export const SOURCES_TOTAL_MAX_CHARS = 24_000;
const MAX_EXEMPLARS = 4;
const MIN_LEAD_MS = 10 * 60 * 1000;
const MAX_LEAD_MS = 14 * 24 * 60 * 60 * 1000;
const TRUNCATED = "[truncated]";

export type WriterBrief = {
  readonly target: DraftTarget;
  readonly now: string;
  readonly timezone: string;
  readonly voiceGuide: string;
  readonly preferences: readonly string[];
  readonly exemplars: readonly { readonly platform: SocialPlatform | null; readonly text: string }[];
  readonly idea: string;
  readonly sources: readonly DraftSource[];
  readonly allowLinksOnX: boolean;
};

export function outputSchemaFor(
  target: DraftTarget,
): typeof POST_OUTPUT_SCHEMA | typeof REEL_OUTPUT_SCHEMA | typeof CAROUSEL_OUTPUT_SCHEMA {
  if (target.kind === "post") return POST_OUTPUT_SCHEMA;
  return target.piece === "reel_script" ? REEL_OUTPUT_SCHEMA : CAROUSEL_OUTPUT_SCHEMA;
}

function taskLine(target: DraftTarget): string {
  if (target.kind === "post") {
    return `Write one ${PLATFORMS[target.platform].label} post (or thread, if the platform rules allow it) from the idea below.`;
  }
  return target.piece === "reel_script"
    ? "Write one reel script from the idea below."
    : "Write one carousel outline from the idea below.";
}

function formatNow(now: string, timezone: string): string {
  const shown = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    dateStyle: "full",
    timeStyle: "short",
  }).format(new Date(now));
  return `${shown} (${timezone})`;
}

// A source attribute on one line, without the characters that could end the
// attribute or the tag.
function sourceAttribute(name: string, value: string | null): string {
  const clean = (value ?? "").replace(/[\r\n"<>]+/g, " ").replace(/\s+/g, " ").trim();
  return clean === "" ? "" : ` ${name}="${clean}"`;
}

// Fetched text is data, not instructions: each source sits inside its own
// <source> fence, and a closing tag inside the text can't end the fence early.
function sourcesSection(sources: readonly DraftSource[]): string {
  if (sources.length === 0) return "None.";
  const parts: string[] = [];
  let remaining = SOURCES_TOTAL_MAX_CHARS;
  for (const source of sources.slice(0, MAX_SOURCES)) {
    if (remaining <= 0) break;
    const limit = Math.min(SOURCE_TEXT_MAX_CHARS, remaining);
    const text = source.text.length > limit ? `${source.text.slice(0, limit)}\n${TRUNCATED}` : source.text;
    remaining -= Math.min(source.text.length, limit);
    const fenced = text.replace(/<\/source/gi, "<\\/source");
    const open = `<source${sourceAttribute("title", source.title)}${sourceAttribute("url", source.url)}>`;
    parts.push(`${open}\n${fenced}\n</source>`);
  }
  return parts.join("\n\n");
}

function outputRules(brief: WriterBrief): string {
  const { target } = brief;
  if (target.kind === "post") {
    const lines = [
      `- platform: "${target.platform}".`,
      "- hook: the opening line.",
      "- posts: one item for a single post. For a thread, one item per part, in order.",
      "- imagePrompt: null unless an image clearly helps.",
      "- suggestedTime: ISO 8601 with offset, within the next 14 days, or null.",
      "- notes: a short note for the owner.",
    ];
    if (target.platform === "x" && !brief.allowLinksOnX) lines.push("- Do not include links.");
    return lines.join("\n");
  }
  if (target.piece === "reel_script") {
    return [
      "- title, hook, caption and notes as short strings.",
      "- beats: 3 to 12 items, each with visual, voiceover and onScreenText.",
    ].join("\n");
  }
  return [
    "- title, caption and notes as short strings.",
    "- slides: 3 to 12 items, each with heading and body.",
    "- coverImagePrompt: null unless an image clearly helps.",
  ].join("\n");
}

export function buildWriterMessage(brief: WriterBrief): string {
  const { target } = brief;
  const rules = target.kind === "post" ? PLATFORM_GUIDES[target.platform] : PIECE_GUIDES[target.piece];
  const preferences = brief.preferences.length > 0 ? brief.preferences.map((p) => `- ${p}`).join("\n") : "None yet.";
  const exemplars = brief.exemplars.slice(0, MAX_EXEMPLARS);
  const examples =
    exemplars.length > 0
      ? exemplars
          .map((e, n) => `### Example ${n + 1}${e.platform ? ` (${PLATFORMS[e.platform].label})` : ""}\n${e.text}`)
          .join("\n\n")
      : "None yet.";
  return [
    `## Task\n${taskLine(target)}`,
    `## Now\n${formatNow(brief.now, brief.timezone)}`,
    `## Platform rules\n${rules}`,
    `## Voice guide\n${brief.voiceGuide}`,
    `## Owner preferences\n${preferences}`,
    `## Examples of the owner's posts\n${examples}`,
    `## Idea\n${brief.idea}`,
    `## Sources\n${sourcesSection(brief.sources)}`,
    `## Output\n${outputRules(brief)}`,
  ].join("\n\n");
}

export function buildRepairMessage(issues: readonly LintIssue[]): string {
  const errors = issues.filter((i) => i.severity === "error").map((i) => `- ${i.message}`);
  return [
    "The draft has problems that must be fixed:",
    ...errors,
    "Return the same structured output with these fixed. Keep the owner's voice.",
  ].join("\n");
}

export function buildRevisionMessage(input: {
  readonly brief: WriterBrief;
  readonly currentPosts: readonly string[];
  readonly instruction: string;
}): string {
  const current = input.currentPosts.map((p, n) => `Part ${n + 1}:\n${p}`).join("\n\n");
  return [
    buildWriterMessage(input.brief),
    `## Current draft\n${current}`,
    `## Requested change\n${input.instruction}`,
  ].join("\n\n");
}

export function normalizeSuggestedTime(value: string | null, now: Date): string | null {
  if (value === null) return null;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return null;
  const lead = time - now.getTime();
  if (lead < MIN_LEAD_MS || lead > MAX_LEAD_MS) return null;
  return new Date(time).toISOString();
}

export function postsForPlatform(platform: SocialPlatform, posts: readonly string[]): string[] {
  const kept = posts.map((p) => p.trim()).filter((p) => p.length > 0);
  if (platform === "linkedin") return kept.length > 0 ? [kept.join("\n\n")] : [];
  return kept;
}

export function parseWriterOutput(
  target: DraftTarget,
  data: unknown,
): { readonly ok: true; readonly output: WriterOutput } | { readonly ok: false; readonly message: string } {
  const wrong = { ok: false, message: "The writer returned the wrong shape." } as const;
  const parsed = outputSchemaFor(target).safeParse(data);
  if (!parsed.success) return wrong;
  if (target.kind === "post" && (parsed.data as PostOutput).platform !== target.platform) return wrong;
  return { ok: true, output: parsed.data };
}
