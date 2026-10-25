import { PLATFORM_LIMITS } from "@/lib/drafts/lint";
import type { SocialPlatform } from "@/lib/drafts/types";

export const EDIT_SEPARATOR = "\n---\n";

export function postsToText(posts: readonly string[]): string {
  return posts.join("\n\n");
}

export function postsToEditText(posts: readonly string[]): string {
  return posts.join(EDIT_SEPARATOR);
}

export function editTextToPosts(text: string): string[] {
  const posts: string[] = [];
  let current: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "---") {
      posts.push(current.join("\n"));
      current = [];
    } else {
      current.push(line);
    }
  }
  posts.push(current.join("\n"));
  return posts.map((post) => post.trim()).filter((post) => post.length > 0);
}

// An edit as the posts to save. A single-post platform such as LinkedIn keeps
// a --- line as text; only thread platforms split on it.
export function editTextToPlatformPosts(platform: SocialPlatform, text: string): string[] {
  if (PLATFORM_LIMITS[platform].maxParts === 1) {
    const post = text.trim();
    return post === "" ? [] : [post];
  }
  return editTextToPosts(text);
}
