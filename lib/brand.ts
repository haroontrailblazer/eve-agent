// The harpy brand mark: a winged orb — the agent (orb) given wings, a nod to
// the harpy. A central disc with two up-swept wings and a slim tail, on a
// 100x100 square canvas. Split left-wing / orb+tail / right-wing so the wings
// can beat around the orb (and the orb bob) in the "Thinking…" indicator.
export const HARPY_LOGO_VIEWBOX = "0 0 100 100";
export const HARPY_LOGO_PATH =
  "M50 27 A11 11 0 1 0 50 49 A11 11 0 1 0 50 27 Z " +
  "M53 48 C67 45 81 42 91 33 C86 46 75 55 61 59 C57 60 54 55 53 48 Z " +
  "M47 48 C33 45 19 42 9 33 C14 46 25 55 39 59 C43 60 46 55 47 48 Z " +
  "M50 54 L52 82 L50 90 L48 82 Z";

// Colors for the surfaces that cannot read the CSS tokens: the apple icon, the
// social image and the OAuth callback page. `tile` is the three stops of the
// tile gradient in app/icon.svg (top, middle, bottom); a test keeps the two in
// step.
export interface BrandImageColors {
  readonly tile: readonly [string, string, string];
  readonly ogBackground: string;
  readonly ogMuted: string;
  readonly callbackBackground: string;
  readonly callbackText: string;
  readonly callbackMuted: string;
}

export const BRAND_IMAGE_COLORS: BrandImageColors = {
  tile: ["#54585f", "#26282c", "#0a0b0d"],
  ogBackground: "#050505",
  ogMuted: "#a1a1a1",
  callbackBackground: "#0a0b0d",
  callbackText: "#edeff2",
  callbackMuted: "#9aa1ad",
};
