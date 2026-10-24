import { describe, expect, it } from "vitest";
import {
  parseSidebarOpen,
  readSidebarCookie,
  serializeSidebarOpen,
  SIDEBAR_COOKIE_MAX_AGE,
  SIDEBAR_COOKIE_NAME,
  SIDEBAR_HINT_ATTRIBUTE,
  sidebarHintScript,
  writeSidebarHint,
} from "@/lib/sidebar-hint";

describe("parseSidebarOpen", () => {
  it("defaults to open when there is no cookie", () => expect(parseSidebarOpen(undefined)).toBe(true));
  it("reads collapsed as closed", () => expect(parseSidebarOpen("collapsed")).toBe(false));
  it("reads open as open", () => expect(parseSidebarOpen("open")).toBe(true));
  it("treats anything else as open", () => {
    expect(parseSidebarOpen("")).toBe(true);
    expect(parseSidebarOpen("closed")).toBe(true);
    expect(parseSidebarOpen("bogus")).toBe(true);
  });
});

describe("serializeSidebarOpen", () => {
  it("writes collapsed for a closed sidebar", () => expect(serializeSidebarOpen(false)).toBe("collapsed"));
  it("writes open for an open sidebar", () => expect(serializeSidebarOpen(true)).toBe("open"));
  it("round-trips through parseSidebarOpen", () => {
    expect(parseSidebarOpen(serializeSidebarOpen(true))).toBe(true);
    expect(parseSidebarOpen(serializeSidebarOpen(false))).toBe(false);
  });
});

describe("readSidebarCookie", () => {
  it("finds the cookie among others", () => {
    expect(readSidebarCookie("a=1; harpy-sidebar=collapsed; b=2")).toBe("collapsed");
    expect(readSidebarCookie("harpy-sidebar=open")).toBe("open");
  });

  it("is undefined when the cookie is missing", () => {
    expect(readSidebarCookie("")).toBeUndefined();
    expect(readSidebarCookie("a=1; b=2")).toBeUndefined();
  });

  it("ignores cookies whose name only ends with the sidebar cookie name", () => {
    expect(readSidebarCookie("x-harpy-sidebar=collapsed")).toBeUndefined();
  });
});

interface FakeDocument {
  cookie: string;
  readonly documentElement: {
    readonly attributes: Map<string, string>;
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  };
}

function fakeDocument(cookie: string): FakeDocument {
  const attributes = new Map<string, string>();

  return {
    cookie,
    documentElement: {
      attributes,
      setAttribute: (name, value) => void attributes.set(name, value),
      removeAttribute: (name) => void attributes.delete(name),
    },
  };
}

describe("writeSidebarHint", () => {
  it("collapsing writes the cookie and sets the attribute", () => {
    const doc = fakeDocument("");
    writeSidebarHint(doc, false);
    expect(doc.cookie).toBe(
      `${SIDEBAR_COOKIE_NAME}=collapsed; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`,
    );
    expect(doc.documentElement.attributes.get(SIDEBAR_HINT_ATTRIBUTE)).toBe("collapsed");
  });

  it("opening writes the cookie and clears the attribute", () => {
    const doc = fakeDocument("");
    doc.documentElement.setAttribute(SIDEBAR_HINT_ATTRIBUTE, "collapsed");
    writeSidebarHint(doc, true);
    expect(doc.cookie).toBe(
      `${SIDEBAR_COOKIE_NAME}=open; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`,
    );
    expect(doc.documentElement.attributes.has(SIDEBAR_HINT_ATTRIBUTE)).toBe(false);
  });
});

// Runs the hint script against a fake document. The script refers to
// `document` as a free identifier, so passing it as a parameter of the
// Function shadows the real (absent) global.
function runHintScript(cookie: string | "throws") {
  const doc = fakeDocument("");
  const target =
    cookie === "throws"
      ? {
          get cookie(): string {
            throw new Error("cookies blocked");
          },
          documentElement: doc.documentElement,
        }
      : { ...doc, cookie };

  new Function("document", sidebarHintScript)(target);
  return doc.documentElement.attributes;
}

describe("sidebarHintScript", () => {
  it("reads the sidebar cookie", () => expect(sidebarHintScript).toContain("harpy-sidebar"));

  it("parses as JavaScript without running", () =>
    expect(() => new Function(sidebarHintScript)).not.toThrow());

  it("sets the collapsed attribute only for a collapsed cookie", () => {
    expect(runHintScript("harpy-sidebar=collapsed").get(SIDEBAR_HINT_ATTRIBUTE)).toBe("collapsed");
    expect(runHintScript("a=1; harpy-sidebar=collapsed").get(SIDEBAR_HINT_ATTRIBUTE)).toBe(
      "collapsed",
    );
    expect(runHintScript("harpy-sidebar=open").has(SIDEBAR_HINT_ATTRIBUTE)).toBe(false);
    expect(runHintScript("").has(SIDEBAR_HINT_ATTRIBUTE)).toBe(false);
  });

  it("agrees with readSidebarCookie and parseSidebarOpen", () => {
    for (const cookie of [
      "",
      "harpy-sidebar=collapsed",
      "harpy-sidebar=open",
      "harpy-sidebar=closed",
      "harpy-sidebar=",
      "x-harpy-sidebar=collapsed",
      "theme=dark; harpy-sidebar=collapsed; eve_logged_in=1",
      "theme=dark;harpy-sidebar=collapsed",
    ]) {
      const collapsed = !parseSidebarOpen(readSidebarCookie(cookie));
      expect(runHintScript(cookie).has(SIDEBAR_HINT_ATTRIBUTE), cookie).toBe(collapsed);
    }
  });

  it("leaves the sidebar open when cookies cannot be read", () => {
    expect(() => runHintScript("throws")).not.toThrow();
    expect(runHintScript("throws").has(SIDEBAR_HINT_ATTRIBUTE)).toBe(false);
  });
});
