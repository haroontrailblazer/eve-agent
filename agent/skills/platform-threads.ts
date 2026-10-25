import { defineSkill } from "eve/skills";
import { PLATFORM_GUIDES } from "@/lib/content-guides/platforms";

export default defineSkill({
  description: "Use when writing, checking or editing a post or thread for Threads.",
  markdown: PLATFORM_GUIDES.threads,
});
