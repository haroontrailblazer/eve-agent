// Plain module on purpose: the server root layout imports themeInitScript, so
// this file must not be a client module.

export const THEME_STORAGE_KEY = "harpy-theme";

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

export type ThemePreference = "system" | "light" | "dark";

export function parseThemePreference(value: string | null): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}

export function resolveTheme(
  preference: ThemePreference,
  prefersDark: boolean,
): "light" | "dark" {
  if (preference === "system") return prefersDark ? "dark" : "light";
  return preference;
}

// Runs before first paint from <head>, so it cannot import anything. It mirrors
// parseThemePreference and resolveTheme above; lib/theme.test.ts runs it against
// fake browser globals and checks the two stay in agreement.
// A blocked localStorage falls back to the OS setting, and any other failure
// falls back to dark.
export const themeInitScript = `(() => {
  const root = document.documentElement;
  const apply = (theme) => {
    root.classList.remove("dark", "light");
    root.classList.add(theme);
    root.style.colorScheme = theme;
  };
  try {
    let stored = null;
    try {
      stored = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    } catch {}
    apply(
      stored === "light" || stored === "dark"
        ? stored
        : window.matchMedia(${JSON.stringify(PREFERS_DARK_QUERY)}).matches
          ? "dark"
          : "light",
    );
  } catch {
    apply("dark");
  }
})();`;
