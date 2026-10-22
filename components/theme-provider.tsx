"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  PREFERS_DARK_QUERY,
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from "@/lib/theme";

interface ThemeContextValue {
  readonly preference: ThemePreference;
  readonly resolvedTheme: "light" | "dark";
  setPreference(preference: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

// Holds the choice for this tab when localStorage rejects the write, so the
// picker still works for the session in browsers that block site data.
let unsavedPreference: ThemePreference | null = null;

// The storage event only fires in other tabs, so same-tab writes notify here.
const preferenceListeners = new Set<() => void>();

function readPreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored !== null) return parseThemePreference(stored);
  } catch {
    // Fall through to the in-memory value.
  }
  return unsavedPreference ?? "system";
}

function writePreference(preference: ThemePreference) {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
    unsavedPreference = null;
  } catch {
    unsavedPreference = preference;
  }
  for (const notify of preferenceListeners) notify();
}

function subscribePreference(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    // A null key means the whole storage area was cleared.
    if (event.key === null || event.key === THEME_STORAGE_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  preferenceListeners.add(onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    preferenceListeners.delete(onChange);
  };
}

const getServerPreference = (): ThemePreference => "system";

function readPrefersDark() {
  return window.matchMedia(PREFERS_DARK_QUERY).matches;
}

// Matches the init script's fallback, so server and first client render agree.
const getServerPrefersDark = () => true;

function applyTheme(theme: "light" | "dark") {
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

export function ThemeProvider({ children }: { readonly children: ReactNode }) {
  const preference = useSyncExternalStore(
    subscribePreference,
    readPreference,
    getServerPreference,
  );

  // Only an OS-following preference needs to hear OS changes, so the
  // subscription is dropped for explicit light or dark.
  const subscribePrefersDark = useCallback(
    (onChange: () => void) => {
      if (preference !== "system") return () => {};
      const media = window.matchMedia(PREFERS_DARK_QUERY);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    [preference],
  );
  const prefersDark = useSyncExternalStore(
    subscribePrefersDark,
    readPrefersDark,
    getServerPrefersDark,
  );

  const resolvedTheme = resolveTheme(preference, prefersDark);

  useEffect(() => {
    // Resolve from live storage and matchMedia instead of the rendered values:
    // while hydrating, React renders the server snapshots (system, dark), and
    // applying those would flash the wrong theme over what the init script set.
    applyTheme(resolveTheme(readPreference(), readPrefersDark()));
  }, [preference, prefersDark]);

  const setPreference = useCallback((next: ThemePreference) => writePreference(next), []);

  const value = useMemo<ThemeContextValue>(
    () => ({ preference, resolvedTheme, setPreference }),
    [preference, resolvedTheme, setPreference],
  );

  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (context === null) throw new Error("useTheme must be used inside ThemeProvider");
  return context;
}
