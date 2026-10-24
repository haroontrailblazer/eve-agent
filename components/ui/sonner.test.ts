import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster } from "@/components/ui/sonner";

const themeState = vi.hoisted(() => ({ resolvedTheme: "dark" as "light" | "dark" }));

vi.mock("@/components/theme-provider", () => ({
  useTheme: () => ({
    preference: themeState.resolvedTheme,
    resolvedTheme: themeState.resolvedTheme,
    setPreference: () => {},
  }),
}));

// Sonner draws nothing until a toast exists, so the stand-in echoes the theme it was given.
vi.mock("sonner", () => ({
  Toaster: ({ theme }: { theme?: string }) =>
    createElement("div", { "data-testid": "sonner", "data-theme": theme }),
}));

describe("Toaster", () => {
  beforeEach(() => {
    themeState.resolvedTheme = "dark";
  });

  it("follows the resolved theme from the app's theme provider", () => {
    themeState.resolvedTheme = "light";
    expect(renderToStaticMarkup(createElement(Toaster))).toContain('data-theme="light"');

    themeState.resolvedTheme = "dark";
    expect(renderToStaticMarkup(createElement(Toaster))).toContain('data-theme="dark"');
  });
});
