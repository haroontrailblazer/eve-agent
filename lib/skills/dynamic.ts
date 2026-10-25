import type { Skill } from "@/lib/db/schema";

export const MY_SKILLS_MAX = 20;

const SKILL_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

// The owner's enabled custom skills as dynamic skill entries named my-<slug>,
// capped at the first 20 by slug order.
export function mySkillEntries(
  skills: readonly Pick<Skill, "slug" | "name" | "description" | "prompt" | "enabled">[],
): { readonly name: string; readonly description: string; readonly markdown: string }[] {
  return [...skills]
    .sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0))
    .filter((skill) => skill.enabled && skill.prompt.trim() !== "")
    .map((skill) => ({
      name: `my-${skill.slug}`,
      description: skill.description || `The owner's ${skill.name} skill.`,
      markdown: skill.prompt,
    }))
    .filter((entry) => SKILL_NAME.test(entry.name))
    .slice(0, MY_SKILLS_MAX);
}
