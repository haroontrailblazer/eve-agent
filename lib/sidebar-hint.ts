// Plain module on purpose: the server root layout imports sidebarHintScript,
// so this file must not be a client module.
//
// The app layout renders statically (cacheComponents), so the server cannot
// read this cookie. Instead the hint script runs from <head> before first
// paint and sets html[data-harpy-sidebar="collapsed"], and unlayered rules in
// app/globals.css collapse the desktop sidebar from that attribute. AppShell
// then reads the same cookie into React state.

export const SIDEBAR_COOKIE_NAME = "harpy-sidebar";
export const SIDEBAR_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;
export const SIDEBAR_HINT_ATTRIBUTE = "data-harpy-sidebar";

// Open unless the cookie says "collapsed".
export function parseSidebarOpen(value: string | undefined): boolean {
  return value !== "collapsed";
}

export function serializeSidebarOpen(open: boolean): "open" | "collapsed" {
  return open ? "open" : "collapsed";
}

// The sidebar cookie's value from a document.cookie string, or undefined.
export function readSidebarCookie(cookie: string): string | undefined {
  const prefix = `${SIDEBAR_COOKIE_NAME}=`;
  const entry = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));

  if (entry === undefined) {
    return undefined;
  }

  try {
    return decodeURIComponent(entry.slice(prefix.length));
  } catch {
    return entry.slice(prefix.length);
  }
}

type SidebarHintDocument = {
  cookie: string;
  readonly documentElement: {
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  };
};

// Saves the choice for the next load and updates the attribute the CSS reads,
// so the attribute never holds a stale "collapsed" once the sidebar is open.
export function writeSidebarHint(doc: SidebarHintDocument, open: boolean) {
  doc.cookie = `${SIDEBAR_COOKIE_NAME}=${serializeSidebarOpen(open)}; Path=/; Max-Age=${SIDEBAR_COOKIE_MAX_AGE}; SameSite=Lax`;

  if (open) {
    doc.documentElement.removeAttribute(SIDEBAR_HINT_ATTRIBUTE);
  } else {
    doc.documentElement.setAttribute(SIDEBAR_HINT_ATTRIBUTE, "collapsed");
  }
}

// Runs before first paint from <head>, so it cannot import anything. It
// mirrors readSidebarCookie and parseSidebarOpen above; lib/sidebar-hint.test.ts
// runs it against a fake document and checks the two stay in agreement. If
// cookies cannot be read, the sidebar stays open.
export const sidebarHintScript = `(() => {
  try {
    const prefix = ${JSON.stringify(`${SIDEBAR_COOKIE_NAME}=`)};
    const entry = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(prefix));
    if (entry === undefined) return;
    let value = entry.slice(prefix.length);
    try {
      value = decodeURIComponent(value);
    } catch {}
    if (value === "collapsed") {
      document.documentElement.setAttribute(${JSON.stringify(SIDEBAR_HINT_ATTRIBUTE)}, "collapsed");
    }
  } catch {}
})();`;
