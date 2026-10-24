// A small text parser for the design tokens in app/globals.css. It reads the
// light, dark and @theme blocks and says which custom properties each declares.
// Tests use it to keep the token tables in step; it is not a CSS parser.

export interface ThemeBlocks {
  readonly light: string;
  readonly dark: string;
  readonly theme: string;
}

// Matches the opening of a top-level rule, at the start of the text or right
// after the previous rule's closing brace or at-rule semicolon.
const LIGHT_OPENER = /(?:^|[;}])\s*:root\s*,\s*\.light\s*\{/;
const DARK_OPENER = /(?:^|[;}])\s*\.dark\s*\{/;
const THEME_OPENER = /(?:^|[;}])\s*@theme\s+inline\s*\{/;

// Quoted strings are kept whole, so a glob like "dist/*.js" in an @source rule
// does not open a comment.
function stripComments(css: string): string {
  return css.replace(
    /("(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|\/\*[\s\S]*?\*\//g,
    (_match, quoted: string | undefined) => quoted ?? "",
  );
}

// Returns the index of the brace that closes the block whose body starts at
// `start`, or the end of the text when the block never closes.
function findClosingBrace(css: string, start: number): number {
  let depth = 1;

  for (let index = start; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return css.length;
}

// Returns the text between the braces of the first rule matching `opener`, or
// an empty string when there is no such rule.
function readBlock(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) return "";

  const start = match.index + match[0].length;
  return css.slice(start, findClosingBrace(css, start));
}

export function readThemeBlocks(css: string): ThemeBlocks {
  const text = stripComments(css);

  return {
    light: readBlock(text, LIGHT_OPENER),
    dark: readBlock(text, DARK_OPENER),
    theme: readBlock(text, THEME_OPENER),
  };
}

// Collapses the whitespace in a media query, so "(a:  b)" and "( a: b )" read
// the same as "(a: b)".
function normalizeQuery(query: string): string {
  return query
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\(\s*/g, "(")
    .replace(/\s*\)/g, ")")
    .trim();
}

// Returns the body of every @media rule whose condition is `query`, in source
// order. Comments are ignored.
export function readMediaBlocks(css: string, query: string): string[] {
  const text = stripComments(css);
  const wanted = normalizeQuery(query);
  const opener = /(?:^|[;{}])\s*@media\s+([^{;]+)\{/g;
  const bodies: string[] = [];

  for (let match = opener.exec(text); match; match = opener.exec(text)) {
    if (normalizeQuery(match[1]) !== wanted) continue;

    const start = match.index + match[0].length;
    const end = findClosingBrace(text, start);
    bodies.push(text.slice(start, end));
    opener.lastIndex = end;
  }

  return bodies;
}

function normalizeSelectorList(selectors: string): string {
  return selectors
    .split(",")
    .map((selector) => selector.trim().replace(/\s+/g, " "))
    .join(", ");
}

// Returns the declarations of the first rule in `block` whose selector list is
// exactly `selector` (whitespace aside), or an empty string when there is none.
// Only rules at the top of `block` are read.
export function readRule(block: string, selector: string): string {
  const text = stripComments(block);
  const wanted = normalizeSelectorList(selector);
  let prelude = "";

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === "{") {
      const end = findClosingBrace(text, index + 1);
      if (normalizeSelectorList(prelude) === wanted) return text.slice(index + 1, end);
      prelude = "";
      index = end;
    } else if (char === ";" || char === "}") {
      prelude = "";
    } else {
      prelude += char;
    }
  }

  return "";
}

// True when `block` declares the custom property `--<name>`. `name` is given
// without the leading dashes.
export function declaresToken(block: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(?<![\\w-])--${escaped}\\s*:`).test(block);
}
