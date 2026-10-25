import { BANNED_PATTERNS } from "@/lib/content-guides/anti-ai";
import type { SocialPlatform } from "@/lib/drafts/types";
import { PLATFORMS } from "@/lib/platforms";

export const PLATFORM_LIMITS = {
  x: { maxChars: 280, maxParts: 10, maxHashtags: 2, maxCashtags: 1 },
  linkedin: { maxChars: 3000, maxParts: 1, maxHashtags: 3 },
  threads: { maxChars: 500, maxParts: 10, maxHashtags: 1, maxLinks: 5 },
} as const;

export type LintCode =
  | "empty"
  | "too_long"
  | "too_many_parts"
  | "banned_phrase"
  | "em_dash"
  | "link_on_x"
  | "too_many_links"
  | "too_many_hashtags"
  | "too_many_cashtags";

export type LintIssue = {
  readonly code: LintCode;
  readonly severity: "error" | "warning";
  readonly message: string;
  readonly part?: number;
};

const URL_PATTERN = /(?:https?:\/\/|www\.)\S+/gi;
const HASHTAG_PATTERN = /#[\p{L}\p{N}_]+/gu;
const CASHTAG_PATTERN = /\$[A-Za-z]{1,6}\b/g;
const X_URL_LENGTH = 23;

function countLinks(text: string): number {
  return text.match(URL_PATTERN)?.length ?? 0;
}

export function containsLink(text: string): boolean {
  return countLinks(text) > 0;
}

export function countPostChars(platform: SocialPlatform, text: string): number {
  if (platform !== "x") return Array.from(text).length;
  return Array.from(text.replace(URL_PATTERN, "")).length + countLinks(text) * X_URL_LENGTH;
}

function phraseIssues(text: string, part?: number): LintIssue[] {
  const issues: LintIssue[] = [];
  const at = part === undefined ? "" : `Post ${part}: `;
  const partField = part === undefined ? {} : { part };
  for (const { label, pattern } of BANNED_PATTERNS) {
    if (pattern.test(text)) {
      issues.push({
        code: "banned_phrase",
        severity: "error",
        message: `${at}Uses "${label}". Say it plainly instead.`,
        ...partField,
      });
    }
  }
  if (text.includes("—")) {
    issues.push({
      code: "em_dash",
      severity: "error",
      message: `${at}Has an em dash. Use a period or a comma.`,
      ...partField,
    });
  }
  return issues;
}

export function lintText(text: string): LintIssue[] {
  return phraseIssues(text);
}

export function lintPost(input: {
  readonly platform: SocialPlatform;
  readonly posts: readonly string[];
  readonly allowLinks: boolean;
}): LintIssue[] {
  const { platform, posts, allowLinks } = input;
  const limits = PLATFORM_LIMITS[platform];
  const label = PLATFORMS[platform].label;
  const issues: LintIssue[] = [];
  const isThread = posts.length > 1;

  if (posts.length === 0 || posts.some((p) => p.trim() === "")) {
    issues.push({ code: "empty", severity: "error", message: "The post is empty." });
  }
  if (posts.length > limits.maxParts) {
    issues.push({
      code: "too_many_parts",
      severity: "error",
      message:
        limits.maxParts === 1
          ? `${label} takes one post, not a thread.`
          : `${label} threads can have ${limits.maxParts} posts. This one has ${posts.length}.`,
    });
  }

  posts.forEach((text, index) => {
    const part = isThread ? index + 1 : undefined;
    const partField = part === undefined ? {} : { part };
    const at = part === undefined ? "" : `Post ${part}: `;

    const count = countPostChars(platform, text);
    if (count > limits.maxChars) {
      issues.push({
        code: "too_long",
        severity: "error",
        message: `${at}${label} posts can be ${limits.maxChars} characters. This one has ${count}.`,
        ...partField,
      });
    }
    issues.push(...phraseIssues(text, part));

    const links = countLinks(text);
    if (platform === "x" && links > 0 && !allowLinks) {
      issues.push({
        code: "link_on_x",
        severity: "error",
        message: `${at}Links on X cost $0.20 a post. Remove it unless you want one.`,
        ...partField,
      });
    }
    if (platform === "threads" && links > PLATFORM_LIMITS.threads.maxLinks) {
      issues.push({
        code: "too_many_links",
        severity: "error",
        message: `${at}Threads allows ${PLATFORM_LIMITS.threads.maxLinks} links in a post. This one has ${links}.`,
        ...partField,
      });
    }
  });

  const all = posts.join("\n");
  if (platform === "x") {
    const cashtags = all.match(CASHTAG_PATTERN)?.length ?? 0;
    if (cashtags > PLATFORM_LIMITS.x.maxCashtags) {
      issues.push({
        code: "too_many_cashtags",
        severity: "error",
        message: `X allows ${PLATFORM_LIMITS.x.maxCashtags} cashtag. This draft has ${cashtags}.`,
      });
    }
  }
  const hashtags = all.match(HASHTAG_PATTERN)?.length ?? 0;
  if (hashtags > limits.maxHashtags) {
    issues.push({
      code: "too_many_hashtags",
      severity: "warning",
      message: `${label} works best with ${limits.maxHashtags} hashtag${limits.maxHashtags === 1 ? "" : "s"} or fewer. This draft has ${hashtags}.`,
    });
  }
  return issues;
}

export function hasLintErrors(issues: readonly LintIssue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}
