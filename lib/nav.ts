// The app's sections, in sidebar order. Plain data on purpose, with no React
// imports: the sidebar maps each href to its icon itself.

export type NavItem = { readonly href: string; readonly label: string };

export const APP_NAV: readonly NavItem[] = [
  { href: "/", label: "Studio" },
  { href: "/calendar", label: "Calendar" },
  { href: "/inbox", label: "Inbox" },
  { href: "/brief", label: "Brief" },
  { href: "/brand-voice", label: "Brand voice" },
  { href: "/channels", label: "Channels" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

// "/" is active only on itself. Any other section is active on its own route
// and everything under it, so "/chat" covers "/chat/abc" but not "/chatter".
export function isNavItemActive(href: string, pathname: string): boolean {
  if (href === "/") {
    return pathname === "/";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

// The chat home and every chat. The sidebar lists recent chats on these routes.
export function isChatPath(pathname: string): boolean {
  return isNavItemActive("/chat", pathname);
}
