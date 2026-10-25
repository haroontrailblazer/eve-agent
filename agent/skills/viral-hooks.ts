import { defineSkill } from "eve/skills";
import { VIRAL_HOOKS_GUIDE } from "@/lib/content-guides/hooks";

export default defineSkill({
  description: "Use when writing or judging the opening line of a post, thread, reel or carousel.",
  markdown: VIRAL_HOOKS_GUIDE,
});
