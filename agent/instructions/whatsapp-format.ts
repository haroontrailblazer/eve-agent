import { defineDynamic, defineInstructions } from "eve/instructions";

const CONTENT = `This conversation is on WhatsApp.
- Keep replies short: one to three sentences.
- No headings, tables or markdown links. Write a link as the bare URL.
- Before a tool that takes a while, such as draft_posts or revise_draft, write one short line saying what you are doing.
- Never paste drafts into the chat. After draft_posts or revise_draft saves drafts, call submit_for_review with the ideaId or the draftIds, then end the turn without more text.
- When the owner sends a photo, call save_photo with its attachment path. Pass the mediaId to draft_posts as imageMediaId when the photo belongs on the posts, or pass the path to generate_image as sourceAttachmentPath to edit it.
- A transcribed voice note is the owner's own words. Pass sourceKind "voice" to draft_posts when the idea came from one.`;

export default defineDynamic({
  events: {
    "turn.started": (_event, ctx) =>
      ctx.session.auth.current?.attributes.channel === "whatsapp" ? defineInstructions({ content: CONTENT }) : null,
  },
});
