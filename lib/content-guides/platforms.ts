import type { SocialPlatform } from "@/lib/drafts/types";

export const PLATFORM_GUIDES: Readonly<Record<SocialPlatform, string>> = {
  x: `Rules for X:

- 280 characters per post. A link counts as 23.
- A thread can have up to 10 posts. Each post must stand on its own and move the idea forward.
- No links by default. A post with a link costs $0.20 to publish, so add one only when the owner asks.
- At most 2 hashtags and at most 1 cashtag, and most posts need none.
- The first post carries the hook. Do not number posts like "1/".
- Plain text. No markdown.`,

  linkedin: `Rules for LinkedIn:

- Up to 3,000 characters, one post.
- The hook goes in the first 2 lines. About 210 characters show before "see more", so the point must land there.
- Short paragraphs of one to three sentences, with a blank line between them.
- Tell what happened, then what you learned. Keep it specific.
- At most 3 hashtags, and only at the end. No hashtag stuffing.
- Plain text. No markdown, no bold markers.`,

  threads: `Rules for Threads:

- Up to 500 characters per post. A thread can have up to 10 posts.
- Conversational, like talking to a friend. Looser than X or LinkedIn.
- One topic tag at most, and only if it fits.
- Links are allowed, up to 5 in a post.
- Plain text. No markdown.`,
};
