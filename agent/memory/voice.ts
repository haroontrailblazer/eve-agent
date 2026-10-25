import { defineMemory } from "eve/memory";
import { voiceMemoryProvider } from "@/lib/voice/memory";

export default defineMemory({
  description: "The owner's brand voice: stated preferences and example posts.",
  provider: voiceMemoryProvider(),
  scope(ctx) {
    const id = ctx.session.auth.current?.attributes.brandId;
    return typeof id === "string" && id ? [id] : null;
  },
});
