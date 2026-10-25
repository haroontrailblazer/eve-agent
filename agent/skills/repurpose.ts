import { defineSkill } from "eve/skills";
import { PIECE_GUIDES, REPURPOSE_GUIDE } from "@/lib/content-guides/repurpose";

export default defineSkill({
  description:
    "Use when turning a link, article, transcript or long text into posts, a reel script or a carousel outline.",
  deferred: true,
  markdown: [REPURPOSE_GUIDE, PIECE_GUIDES.reel_script, PIECE_GUIDES.carousel_outline].join("\n\n"),
});
