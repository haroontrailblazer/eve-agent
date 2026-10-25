import { lintPost } from "../../lib/drafts/lint";

// Helpers for the drafting evals. Keep this file free of the db client and
// anything server-only: eval files import it by relative path.

type Platform = "x" | "linkedin" | "threads";

export type EvalIdea = {
  readonly id: string;
  readonly idea: string;
  readonly platforms: readonly Platform[];
  readonly allowLinks?: boolean;
};

const LABELS: Readonly<Record<Platform, string>> = {
  x: "X",
  linkedin: "LinkedIn",
  threads: "Threads",
};

function joinLabels(labels: readonly string[]): string {
  if (labels.length <= 1) return labels.join("");
  return `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
}

export function draftRequestMessage(idea: EvalIdea): string {
  const labels = joinLabels(idea.platforms.map((p) => LABELS[p]));
  const base = `Draft posts for ${labels} about this idea, using draft_posts: ${idea.idea}`;
  return idea.allowLinks ? `${base} Links are fine on X.` : base;
}

type EvalDraft = {
  readonly platform: Platform;
  readonly posts: readonly string[];
  readonly hook: string;
};

function isPlatform(value: unknown): value is Platform {
  return value === "x" || value === "linkedin" || value === "threads";
}

export function draftsFromToolCalls(
  toolCalls: readonly { readonly name: string; readonly output: unknown }[],
): readonly EvalDraft[] {
  const drafts: EvalDraft[] = [];
  for (const call of toolCalls) {
    if (call.name !== "draft_posts") continue;
    const output = call.output as { ok?: unknown; drafts?: unknown } | null | undefined;
    if (!output || output.ok !== true || !Array.isArray(output.drafts)) continue;
    for (const draft of output.drafts as readonly Record<string, unknown>[]) {
      if (!isPlatform(draft.platform) || !Array.isArray(draft.posts)) continue;
      drafts.push({
        platform: draft.platform,
        posts: draft.posts.map(String),
        hook: typeof draft.hook === "string" ? draft.hook : "",
      });
    }
  }
  return drafts;
}

export function hardIssues(
  draft: { readonly platform: Platform; readonly posts: readonly string[] },
  allowLinks: boolean,
): string[] {
  return lintPost({ platform: draft.platform, posts: draft.posts, allowLinks })
    .filter((issue) => issue.severity === "error")
    .map((issue) => issue.message);
}
