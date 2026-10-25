export const BANNED_PATTERNS: readonly { readonly label: string; readonly pattern: RegExp }[] = [
  { label: "delve", pattern: /\bdelv(?:e|es|ed|ing)\b/i },
  { label: "tapestry", pattern: /\btapestr(?:y|ies)\b/i },
  { label: "testament to", pattern: /\btestament to\b/i },
  { label: "in today's fast-paced world", pattern: /\bin today['’]s fast[- ]paced world\b/i },
  { label: "game-changer", pattern: /\bgame[- ]chang(?:er|ers|ing)\b/i },
  { label: "unlock the power", pattern: /\bunlock(?:ing)? the (?:power|potential)\b/i },
  { label: "let's dive in", pattern: /\blet['’]s dive (?:in|into)\b/i },
  { label: "navigate the complexities", pattern: /\bnavigat(?:e|ing) the complexit(?:y|ies)\b/i },
  { label: "ever-evolving", pattern: /\bever[- ]evolving\b/i },
  { label: "elevate your", pattern: /\belevat(?:e|es|ing) your\b/i },
  { label: "in conclusion", pattern: /\bin conclusion\b/i },
];

const BANNED_LIST = BANNED_PATTERNS.map(({ label }) => `"${label}"`).join(", ");

export const ANTI_AI_RULES = `- Never use an em dash or an en dash. Use a period, a comma or a colon.
- Never use these phrases: ${BANNED_LIST}.
- Skip hype words such as revolutionary, groundbreaking, seamless, supercharge and robust.
- Do not group things in threes just for rhythm.
- Do not open with "Here's the thing", a question nobody asked, or a warm-up line.
- Do not close with a summary of what you just said.
- Use straight quotes, not curly quotes.
- Use sentence case, not Title Case.
- Prefer a concrete number, name or example over a general claim.
- Cut any sentence that would still be true on every other account.`;
