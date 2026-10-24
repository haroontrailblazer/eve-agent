import { describe, expect, it } from "vitest";
import {
  parseThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  themeInitScript,
} from "@/lib/theme";

describe("parseThemePreference", () => {
  it("falls back to system for unknown values", () =>
    expect(parseThemePreference("bogus")).toBe("system"));
  it("falls back to system for null", () => expect(parseThemePreference(null)).toBe("system"));
  it("keeps system", () => expect(parseThemePreference("system")).toBe("system"));
  it("keeps light", () => expect(parseThemePreference("light")).toBe("light"));
  it("keeps dark", () => expect(parseThemePreference("dark")).toBe("dark"));
});

describe("resolveTheme", () => {
  it("follows the OS when the preference is system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
  it("ignores the OS for an explicit preference", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });
});

describe("themeInitScript", () => {
  it("reads the storage key", () => expect(themeInitScript).toContain("harpy-theme"));
  it("parses as JavaScript without running", () =>
    expect(() => new Function(themeInitScript)).not.toThrow());
});

interface FakeEnv {
  readonly classes: Set<string>;
  readonly colorScheme: () => string;
  readonly run: () => void;
}

// Runs the init script against fake browser globals. The script refers to
// window, document and localStorage as free identifiers, so passing them as
// parameters of the Function shadows the real (absent) globals.
function runInitScript(options: {
  readonly stored: string | null | "throws";
  readonly prefersDark: boolean | "throws";
  readonly initialClasses?: readonly string[];
}): FakeEnv {
  const classes = new Set(options.initialClasses ?? []);
  const style = { colorScheme: "" };
  const document = {
    documentElement: {
      classList: {
        add: (...names: string[]) => names.forEach((name) => classes.add(name)),
        remove: (...names: string[]) => names.forEach((name) => classes.delete(name)),
      },
      style,
    },
  };
  const window = {
    matchMedia: () => {
      if (options.prefersDark === "throws") throw new Error("matchMedia unavailable");
      return { matches: options.prefersDark };
    },
  };
  const localStorage = {
    getItem: (key: string) => {
      if (options.stored === "throws") throw new Error("storage blocked");
      return key === THEME_STORAGE_KEY ? options.stored : null;
    },
  };
  const run = () => new Function("window", "document", "localStorage", themeInitScript)(
    window,
    document,
    localStorage,
  );
  return { classes, colorScheme: () => style.colorScheme, run };
}

describe("themeInitScript behavior", () => {
  it("applies a stored light preference even when the OS is dark", () => {
    const env = runInitScript({ stored: "light", prefersDark: true });
    env.run();
    expect([...env.classes]).toEqual(["light"]);
    expect(env.colorScheme()).toBe("light");
  });

  it("applies a stored dark preference even when the OS is light", () => {
    const env = runInitScript({ stored: "dark", prefersDark: false });
    env.run();
    expect([...env.classes]).toEqual(["dark"]);
    expect(env.colorScheme()).toBe("dark");
  });

  it("replaces a previous class so exactly one is set", () => {
    const env = runInitScript({
      stored: "light",
      prefersDark: true,
      initialClasses: ["dark", "light", "font-sans"],
    });
    env.run();
    expect([...env.classes].sort()).toEqual(["font-sans", "light"]);
  });

  it("matches resolveTheme for every stored value and OS setting", () => {
    for (const stored of [null, "system", "light", "dark", "bogus"]) {
      for (const prefersDark of [true, false]) {
        const env = runInitScript({ stored, prefersDark });
        env.run();
        const expected = resolveTheme(parseThemePreference(stored), prefersDark);
        expect([...env.classes], `stored=${stored} prefersDark=${prefersDark}`).toEqual([expected]);
        expect(env.colorScheme()).toBe(expected);
      }
    }
  });

  it("follows the OS when storage is blocked", () => {
    const env = runInitScript({ stored: "throws", prefersDark: false });
    env.run();
    expect([...env.classes]).toEqual(["light"]);
  });

  it("falls back to dark when matchMedia fails", () => {
    const env = runInitScript({ stored: null, prefersDark: "throws" });
    env.run();
    expect([...env.classes]).toEqual(["dark"]);
    expect(env.colorScheme()).toBe("dark");
  });
});
