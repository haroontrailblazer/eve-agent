import { defineDynamic, defineSkill } from "eve/skills";
import { listSkills } from "@/lib/db/skills";
import { mySkillEntries } from "@/lib/skills/dynamic";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const auth = ctx.session.auth.current;
      const userId = auth?.principalId;
      const brandId = auth?.attributes.brandId;

      if (typeof brandId !== "string" || !brandId || !userId) {
        return null;
      }

      try {
        const entries = mySkillEntries(await listSkills(userId));
        if (entries.length === 0) return null;

        return Object.fromEntries(
          entries.map((entry) => [
            entry.name,
            defineSkill({ description: entry.description, markdown: entry.markdown, deferred: true }),
          ]),
        );
      } catch (error) {
        console.warn("owner skills failed to load", error);
        return null;
      }
    },
  },
});
