import type { SocialPlatform } from "@/lib/drafts/types";
import type { VoiceExample } from "@/lib/voice/store";

const STOPWORDS = new Set(
  "that this with from have your about into just they them what when will would there their".split(" "),
);

export function keywordSet(text: string): Set<string> {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length >= 4 && !STOPWORDS.has(word));

  return new Set(words);
}

// Picks the examples closest to a topic: 2 points per shared keyword, 1 for a
// platform match, ties broken by newest first.
export function selectExemplars(
  examples: readonly VoiceExample[],
  query: { readonly text: string; readonly platform: SocialPlatform | null; readonly limit: number },
): VoiceExample[] {
  const queryWords = keywordSet(query.text);

  const scored = examples.map((example) => {
    let shared = 0;
    for (const word of keywordSet(example.text)) {
      if (queryWords.has(word)) {
        shared += 1;
      }
    }
    const platformMatch = query.platform !== null && example.platform === query.platform ? 1 : 0;

    return { example, score: 2 * shared + platformMatch };
  });

  scored.sort(
    (a, b) =>
      b.score - a.score ||
      Date.parse(b.example.createdAt) - Date.parse(a.example.createdAt),
  );

  return scored.slice(0, query.limit).map((entry) => entry.example);
}
