export type StudioKeyAction =
  | { readonly type: "move"; readonly delta: 1 | -1 }
  | { readonly type: "approve" | "edit" | "skip" | "help" };

const TYPING_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

// Maps a key press to a Studio action. Letters ignore case so Shift or Caps
// Lock never disables a shortcut; Cmd, Ctrl and Alt keep the browser's own.
export function keyToAction(event: {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly altKey: boolean;
  readonly target: { readonly tagName?: string; readonly isContentEditable?: boolean } | null;
}): StudioKeyAction | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  const tag = event.target?.tagName;
  if (tag && TYPING_TAGS.has(tag.toUpperCase())) return null;
  if (event.target?.isContentEditable) return null;

  switch (event.key.toLowerCase()) {
    case "j":
      return { type: "move", delta: 1 };
    case "k":
      return { type: "move", delta: -1 };
    case "a":
      return { type: "approve" };
    case "e":
      return { type: "edit" };
    case "s":
      return { type: "skip" };
    case "?":
      return { type: "help" };
    default:
      return null;
  }
}

// Moves the selection one step, clamped at both ends. With no (or an unknown)
// current id, +1 picks the first and -1 the last.
export function moveSelection(ids: readonly string[], current: string | null, delta: 1 | -1): string | null {
  if (ids.length === 0) return null;
  const index = current === null ? -1 : ids.indexOf(current);
  if (index === -1) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, index + delta))];
}
