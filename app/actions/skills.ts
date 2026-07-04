"use server";

import { deleteSkill, listSkills } from "@/lib/db/skills";
import { getServerViewer } from "@/lib/session";
import { BUILTIN_SKILLS, mergeSkills, type SkillSummary } from "@/lib/skills/catalog";

// Skills available to the current user: built-in skills plus their installed
// custom ones. Powers the composer slash menu and the profile Skills page.
export async function listSkillsAction(): Promise<SkillSummary[]> {
  const viewer = await getServerViewer();

  if (!viewer) {
    return [...BUILTIN_SKILLS];
  }

  try {
    const custom = await listSkills(viewer.id);

    return mergeSkills(
      custom.map((skill) => ({
        slug: skill.slug,
        name: skill.name,
        description: skill.description,
        prompt: skill.prompt,
        source: "custom" as const,
      })),
    );
  } catch {
    return [...BUILTIN_SKILLS];
  }
}

export async function deleteSkillAction(
  slug: string,
): Promise<{ readonly ok: boolean }> {
  const viewer = await getServerViewer();

  if (!viewer) {
    return { ok: false };
  }

  const removed = await deleteSkill(viewer.id, slug);
  return { ok: removed };
}
