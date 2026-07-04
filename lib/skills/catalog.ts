// Client-safe skills catalog. A "skill" is a named prompt template invokable
// from the composer via "/slug" (Claude-style slash commands). Built-in skills
// ship with the app and are always available; custom skills are stored per-user
// in the database (installed from chat) and are deletable. Both are surfaced in
// the slash menu and on the profile page.

export type SkillSource = "builtin" | "custom";

export type SkillSummary = {
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly prompt: string;
  readonly source: SkillSource;
};

// Built-in skills are defined in code (not the database), so they're always
// present and can't be deleted. Custom skills the user installs live in the DB.
export const BUILTIN_SKILLS: readonly SkillSummary[] = [
  {
    slug: "summarize",
    name: "Summarize",
    description: "Condense a document, thread, or notes into the key points.",
    prompt: "Summarize the following clearly and concisely, keeping the key points:\n\n",
    source: "builtin",
  },
  {
    slug: "explain",
    name: "Explain",
    description: "Explain a concept, error, or piece of code in plain language.",
    prompt: "Explain this simply and thoroughly, with a short example if it helps:\n\n",
    source: "builtin",
  },
  {
    slug: "draft-email",
    name: "Draft email",
    description: "Write a clear, professional email from a few notes.",
    prompt: "Draft a clear, professional email about the following. Keep it concise:\n\n",
    source: "builtin",
  },
  {
    slug: "improve-writing",
    name: "Improve writing",
    description: "Tighten and polish text while keeping your voice.",
    prompt:
      "Improve the writing below — tighten it, fix grammar, and keep the original meaning and voice:\n\n",
    source: "builtin",
  },
];

// Turn a free-form name into a URL/command-safe slug, e.g. "Tweet Thread!" →
// "tweet-thread".
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

// Merge built-in skills with the user's custom skills. Custom skills win on slug
// collisions (a user can override a built-in by installing one with the same
// slug). Sorted by name for stable display.
export function mergeSkills(custom: readonly SkillSummary[]): SkillSummary[] {
  const bySlug = new Map<string, SkillSummary>();

  for (const skill of BUILTIN_SKILLS) {
    bySlug.set(skill.slug, skill);
  }

  for (const skill of custom) {
    bySlug.set(skill.slug, skill);
  }

  return [...bySlug.values()].sort((left, right) => left.name.localeCompare(right.name));
}

// Filter skills by the text typed after "/" in the composer.
export function filterSkills(
  skills: readonly SkillSummary[],
  query: string,
): SkillSummary[] {
  const normalized = query.trim().toLowerCase();

  if (!normalized) {
    return [...skills];
  }

  return skills.filter(
    (skill) =>
      skill.slug.includes(normalized) ||
      skill.name.toLowerCase().includes(normalized),
  );
}
