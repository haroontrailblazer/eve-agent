import { defineTool } from "eve/tools";
import { z } from "zod";
import { listSkills } from "@/lib/db/skills";
import { resolveDbUserId } from "@/lib/mcp-context";
import { BUILTIN_SKILLS } from "@/lib/skills/catalog";

export default defineTool({
  description:
    "List the skills available to the current user — both the built-in skills and any custom ones they've installed. Use this when the user asks what skills they have, what '/' commands exist, or before installing a duplicate.",
  inputSchema: z.object({}),
  async execute(_input, ctx) {
    const userId = await resolveDbUserId(ctx);

    const builtins = BUILTIN_SKILLS.map((skill) => ({
      slug: skill.slug,
      name: skill.name,
      description: skill.description,
      source: "builtin" as const,
    }));

    if (!userId) {
      return { ok: true, skills: builtins };
    }

    try {
      const custom = await listSkills(userId);

      return {
        ok: true,
        skills: [
          ...builtins,
          ...custom.map((skill) => ({
            slug: skill.slug,
            name: skill.name,
            description: skill.description,
            source: "custom" as const,
          })),
        ],
      };
    } catch (error) {
      return {
        ok: false,
        skills: builtins,
        message: `Couldn't read custom skills: ${
          error instanceof Error ? error.message : "database error"
        }`,
      };
    }
  },
});
