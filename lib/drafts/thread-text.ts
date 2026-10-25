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
