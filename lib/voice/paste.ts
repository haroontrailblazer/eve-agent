import { VOICE_EXAMPLE_MIN_CHARS } from "@/lib/voice/store";

export const MAX_PASTED_EXAMPLES = 50;

// Splits pasted text into examples: on lines that are exactly `---`, or, when
// there are none, on two or more blank lines.
export function splitPastedExamples(raw: string): string[] {
  const text = raw.replace(/\r\n?/g, "\n");
  const hasSeparator = text.split("\n").some((line) => line.trim() === "---");
  const pieces = hasSeparator
    ? text.split(/^[ \t]*---[ \t]*$/m)
    : text.split(/\n[ \t]*\n(?:[ \t]*\n)+/);

  return pieces
    .map((piece) => piece.trim())
    .filter((piece) => piece.length >= VOICE_EXAMPLE_MIN_CHARS)
    .slice(0, MAX_PASTED_EXAMPLES);
}
