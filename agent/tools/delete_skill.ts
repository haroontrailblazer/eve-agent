import { defineTool } from "eve/tools";
import { z } from "zod";
import { deleteSkill } from "@/lib/db/skills";
import { resolveDbUserId } from "@/lib/mcp-context";
import { BUILTIN_SKILLS, slugify } from "@/lib/skills/catalog";

export default defineTool({
  description:
    "Delete a custom skill the user installed. Use this when the user asks to remove, delete, or uninstall a skill. Identify it by its slug or name. Built-in skills can't be deleted.",
  inputSchema: z.object({
    slug: z
      .string()
      .min(1)
      .describe("The skill's slug or name, e.g. 'tweet-thread' or 'Tweet thread'."),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to delete skills." };
    }

    const slug = slugify(input.slug);

    if (BUILTIN_SKILLS.some((skill) => skill.slug === slug)) {
      return {
        ok: false,
        message: `"${input.slug}" is a built-in skill, so it can't be deleted.`,
      };
    }

    try {
      const removed = await deleteSkill(userId, slug);

      return removed
        ? { ok: true, slug, message: `Deleted the "${input.slug}" skill.` }
        : { ok: false, message: `You don't have a skill called "${input.slug}".` };
    } catch (error) {
      return {
        ok: false,
        message: `Couldn't delete the skill: ${
          error instanceof Error ? error.message : "database error"
        }`,
      };
    }
  },
});
