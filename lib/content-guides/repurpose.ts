import type { PieceKind } from "@/lib/drafts/types";

export const REPURPOSE_GUIDE = `Turn a source into content for the owner's channels. The source can be a link, an article, a transcript or long text.

1. Read the whole source. Find the one or two points worth sharing. Do not summarize everything.
2. Pull out the concrete parts: numbers, names, quotes and surprises.
3. Write each output from the owner's point of view, in their voice. Do not sound like a press release about the source.
4. Give each output its own angle. Do not paste the same text on every platform.
5. For posts, follow the platform rules. For a reel script or a carousel outline, follow the piece guide.
6. Credit the source when the idea is not the owner's own.`;

export const PIECE_GUIDES: Readonly<Record<PieceKind, string>> = {
  reel_script: `Reel script:

- The hook lands in the first 2 seconds.
- 5 to 8 beats in total.
- Each beat has three parts: visual (what is on screen), voiceover (what is said) and on-screen text (short, a few words).
- Keep the voiceover to short spoken sentences.
- End with one clear action or one last point.
- Add a caption to post with the reel.`,

  carousel_outline: `Carousel outline:

- A cover slide with the hook as its title.
- Then 5 to 9 slides, one idea per slide. A short title and one or two lines of text each.
- A final slide with one call to action.
- A cover image prompt: one sentence describing the cover visual.
- A caption to post with the carousel.`,
};
