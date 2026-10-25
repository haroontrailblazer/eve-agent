import { defineDynamic, defineInstructions } from "eve/instructions";
import { formatVoiceGuideInstruction } from "@/lib/voice/instruction";
import { getActiveVoiceGuide } from "@/lib/voice/store";

export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const brandId = ctx.session.auth.current?.attributes.brandId;

      if (typeof brandId !== "string" || !brandId) {
        return null;
      }

      try {
        return defineInstructions({ content: formatVoiceGuideInstruction(await getActiveVoiceGuide(brandId)) });
      } catch (error) {
        console.warn("brand voice guide failed to load", error);
        return null;
      }
    },
  },
});
