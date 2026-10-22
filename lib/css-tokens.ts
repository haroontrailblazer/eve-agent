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

// Returns the text between the braces of the first rule matching `opener`, or
// an empty string when there is no such rule.
function readBlock(css: string, opener: RegExp): string {
  const match = opener.exec(css);
  if (!match) return "";

  const start = match.index + match[0].length;
  let depth = 1;

  for (let index = start; index < css.length; index += 1) {
    const char = css[index];
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(start, index);
    }
  }

  return css.slice(start);
}

export function readThemeBlocks(css: string): ThemeBlocks {
  const text = stripComments(css);

  return {
    light: readBlock(text, LIGHT_OPENER),
    dark: readBlock(text, DARK_OPENER),
    theme: readBlock(text, THEME_OPENER),
  };
}

// True when `block` declares the custom property `--<name>`. `name` is given
// without the leading dashes.
export function declaresToken(block: string, name: string): boolean {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  return new RegExp(`(?<![\\w-])--${escaped}\\s*:`).test(block);
}
