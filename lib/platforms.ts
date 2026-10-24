// The one registry of platforms harpy talks to. Labels, kinds and color tokens
// live here; the UI looks icons and colors up from these keys instead of
// keeping its own lists.
//
//   social      a network harpy posts to
//   channel     a place the owner talks to harpy
//   connection  an external tool the agent can use while chatting

export type PlatformKey =
  | "x"
  | "linkedin"
  | "threads"
  | "whatsapp"
  | "slack"
  | "notion"
  | "linear"
  | "sentry"
  | "deepwiki";

export type PlatformMeta = {
  readonly key: PlatformKey;
  readonly label: string;
  readonly kind: "social" | "channel" | "connection";
  // The custom property in app/globals.css that colors this platform's glyph.
  // Null for connections, which stay neutral.
  readonly colorToken: `--platform-${string}` | null;
};

export const PLATFORMS: Readonly<Record<PlatformKey, PlatformMeta>> = {
  x: { key: "x", label: "X", kind: "social", colorToken: "--platform-x" },
  linkedin: { key: "linkedin", label: "LinkedIn", kind: "social", colorToken: "--platform-linkedin" },
  threads: { key: "threads", label: "Threads", kind: "social", colorToken: "--platform-threads" },
  whatsapp: { key: "whatsapp", label: "WhatsApp", kind: "channel", colorToken: "--platform-whatsapp" },
  slack: { key: "slack", label: "Slack", kind: "channel", colorToken: "--platform-slack" },
  notion: { key: "notion", label: "Notion", kind: "connection", colorToken: null },
  linear: { key: "linear", label: "Linear", kind: "connection", colorToken: null },
  sentry: { key: "sentry", label: "Sentry", kind: "connection", colorToken: null },
  deepwiki: { key: "deepwiki", label: "DeepWiki", kind: "connection", colorToken: null },
};

// The networks harpy posts to, in the order the UI lists them.
export const SOCIAL_PLATFORMS: readonly PlatformMeta[] = [
  PLATFORMS.x,
  PLATFORMS.linkedin,
  PLATFORMS.threads,
];

// Looks a platform up by its exact key, so "LinkedIn" and "myspace" are both
// null. Own keys only: "constructor" and the like are not platforms.
export function getPlatform(key: string): PlatformMeta | null {
  return Object.hasOwn(PLATFORMS, key) ? PLATFORMS[key as PlatformKey] : null;
}
