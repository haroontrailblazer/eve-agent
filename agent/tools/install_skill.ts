import { defineTool } from "eve/tools";
import { z } from "zod";
import { upsertSkill } from "@/lib/db/skills";
import { resolveDbUserId } from "@/lib/mcp-context";
import { slugify } from "@/lib/skills/catalog";

export default defineTool({
  description:
    "Install (or update) a custom skill for the current user. A skill is a named, reusable prompt the user can invoke from the composer by typing '/slug'. Use this when the user asks to add, create, save, or install a skill. Saves it to the database so it shows up in the composer's slash menu and on the user's profile Skills page. Provide a short `name`, a one-line `description` of what it does, and the `prompt` template the skill runs (the instruction the user's text is appended to).",
  inputSchema: z.object({
    name: z.string().min(1).describe("Display name, e.g. 'Tweet thread'."),
    description: z
      .string()
      .optional()
      .describe("One line describing what the skill does, shown in the menu and profile."),
    prompt: z
      .string()
      .min(1)
      .describe(
        "The prompt template the skill inserts. The user's own text is appended after it, so end with a colon or newline, e.g. 'Turn these notes into a punchy X thread:'.",
      ),
    slug: z
      .string()
      .optional()
      .describe("Optional command slug (letters, numbers, dashes). Defaults to a slug of the name."),
  }),
  async execute(input, ctx) {
    const userId = await resolveDbUserId(ctx);

    if (!userId) {
      return { ok: false, message: "You need to be signed in to install skills." };
    }

    const slug = slugify(input.slug ?? input.name);

    if (!slug) {
      return { ok: false, message: "That name can't be turned into a command. Try a different name." };
    }

    try {
      const saved = await upsertSkill({
        description: input.description ?? "",
        name: input.name.trim(),
        prompt: input.prompt,
        slug,
        userId,
      });

      return {
        ok: true,
        slug: saved.slug,
        name: saved.name,
        message: `Installed the "${saved.name}" skill. Type "/${saved.slug}" in the chat box to use it. It's now on your profile Skills page too.`,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Couldn't install the skill: ${
          error instanceof Error ? error.message : "database error"
        }`,
      };
    }
  },
});
