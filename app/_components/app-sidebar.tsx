"use client";

import {
  ArrowRightIcon,
  CalendarDaysIcon,
  CircleIcon,
  InboxIcon,
  LayoutDashboardIcon,
  MessageSquareQuoteIcon,
  MessagesSquareIcon,
  NewspaperIcon,
  RadioTowerIcon,
  SettingsIcon,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useCallback } from "react";
import { ChatHistoryGroup } from "@/app/_components/chat-history-group";
import { HarpyLogo } from "@/app/_components/harpy-logo";
import { HarpyWordmark } from "@/app/_components/harpy-wordmark";
import { AuthDisplayLoggedIn, AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { UserMenu } from "@/components/auth/user-menu";
import { ChannelStatusPill } from "@/components/harpy/channel-status-pill";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { APP_NAV, isChatPath, isNavItemActive } from "@/lib/nav";

const NAV_ICONS: Readonly<Record<string, LucideIcon>> = {
  "/": LayoutDashboardIcon,
  "/calendar": CalendarDaysIcon,
  "/inbox": InboxIcon,
  "/brief": NewspaperIcon,
  "/brand-voice": MessageSquareQuoteIcon,
  "/channels": RadioTowerIcon,
  "/chat": MessagesSquareIcon,
  "/settings": SettingsIcon,
};

export function AppSidebar({
  activeChatId,
  chats,
  hasMoreChats,
  isLoadingChats,
  isLoadingMore,
  onDeleteChat,
  onLoadMoreChats,
  onSelectChat,
  onSignIn,
  setupStatus,
  slackConfigured,
  whatsappConfigured,
  viewer,
}: {
  readonly activeChatId: string | null;
  readonly chats: readonly ChatListItem[];
  readonly hasMoreChats: boolean;
  // True until the bootstrap reports the viewer and the first page of chats.
  readonly isLoadingChats: boolean;
  readonly isLoadingMore: boolean;
  readonly onDeleteChat: (chatId: string) => Promise<void>;
  readonly onLoadMoreChats: () => Promise<boolean>;
  // Called with the chat a row opens, or null for a new chat.
  readonly onSelectChat: (chatId: string | null) => void;
  readonly onSignIn: () => void;
  readonly setupStatus: SetupStatus;
  readonly slackConfigured: boolean;
  readonly whatsappConfigured: boolean;
  readonly viewer: Viewer | null;
}) {
  const { isMobile, setOpenMobile } = useSidebar();

  // On mobile the sidebar is a sheet over the page; close it once a link is
  // followed so the new page shows.
  const closeMobile = useCallback(() => {
    if (isMobile) {
      setOpenMobile(false);
    }
  }, [isMobile, setOpenMobile]);

  return (
    <Sidebar collapsible="offcanvas">
      <SidebarHeader>
        <Link
          className="flex h-10 items-center gap-2 rounded-md px-2 ring-sidebar-ring outline-hidden focus-visible:ring-2"
          href="/"
          onClick={closeMobile}
        >
          <HarpyLogo className="size-6" />
          <HarpyWordmark className="text-base" />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {/* usePathname suspends while /chat/[id] prerenders (cacheComponents),
            so the static shell shows the nav with nothing highlighted until
            the real route streams in. */}
        <Suspense fallback={<AppNavGroup onNavigate={closeMobile} pathname={null} />}>
          <CurrentRouteNav
            activeChatId={activeChatId}
            chats={chats}
            hasMoreChats={hasMoreChats}
            isLoadingChats={isLoadingChats}
            isLoadingMore={isLoadingMore}
            onDeleteChat={onDeleteChat}
            onLoadMoreChats={onLoadMoreChats}
            onNavigate={closeMobile}
            onSelectChat={onSelectChat}
          />
        </Suspense>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex flex-col items-start gap-1.5 px-2 pb-1">
          <ChannelStatusPill
            platform="whatsapp"
            state={whatsappConfigured ? "connected" : "not_connected"}
          />
          <ChannelStatusPill
            platform="slack"
            state={slackConfigured ? "connected" : "not_connected"}
          />
        </div>
        <SidebarAccount
          authDisabled={!setupStatus.appReady}
          isLoading={isLoadingChats}
          onNavigate={closeMobile}
          onSignIn={() => {
            closeMobile();
            onSignIn();
          }}
          viewer={viewer}
        />
      </SidebarFooter>
    </Sidebar>
  );
}

// The section links, plus "Recent chats" on chat routes.
function CurrentRouteNav({
  onNavigate,
  onSelectChat,
  ...history
}: {
  readonly activeChatId: string | null;
  readonly chats: readonly ChatListItem[];
  readonly hasMoreChats: boolean;
  readonly isLoadingChats: boolean;
  readonly isLoadingMore: boolean;
  readonly onDeleteChat: (chatId: string) => Promise<void>;
  readonly onLoadMoreChats: () => Promise<boolean>;
  readonly onNavigate: () => void;
  readonly onSelectChat: (chatId: string | null) => void;
}) {
  const pathname = usePathname();

  return (
    <>
      <AppNavGroup onNavigate={onNavigate} pathname={pathname} />
      {isChatPath(pathname) ? (
        <ChatHistoryGroup
          {...history}
          onNewChat={() => {
            onSelectChat(null);
            onNavigate();
          }}
          onSelectChat={(chatId) => {
            onSelectChat(chatId);
            onNavigate();
          }}
        />
      ) : null}
    </>
  );
}

// One link per section. With no pathname (the prerender fallback) nothing is
// highlighted.
function AppNavGroup({
  onNavigate,
  pathname,
}: {
  readonly onNavigate: () => void;
  readonly pathname: string | null;
}) {
  return (
    <SidebarGroup>
      <SidebarGroupContent>
        <SidebarMenu>
          {APP_NAV.map((item) => {
            const Icon = NAV_ICONS[item.href] ?? CircleIcon;
            const active = pathname !== null && isNavItemActive(item.href, pathname);

            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={active}>
                  <Link
                    aria-current={active ? "page" : undefined}
                    href={item.href}
                    onClick={onNavigate}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}

function SidebarAccount({
  authDisabled,
  isLoading,
  onNavigate,
  onSignIn,
  viewer,
}: {
  readonly authDisabled: boolean;
  readonly isLoading: boolean;
  readonly onNavigate: () => void;
  readonly onSignIn: () => void;
  readonly viewer: Viewer | null;
}) {
  if (viewer) {
    return <UserMenu onNavigate={onNavigate} viewer={viewer} />;
  }

  // Until the bootstrap lands, the auth hint cookie picks the placeholder: a
  // neutral block for a signed-in visitor, Sign in for everyone else.
  if (isLoading) {
    return (
      <>
        <AuthDisplayLoggedIn>
          <div className="h-12 rounded-md bg-sidebar-accent/50" />
        </AuthDisplayLoggedIn>
        <AuthDisplayLoggedOut>
          <SignInMenuButton disabled={false} onSignIn={onSignIn} />
        </AuthDisplayLoggedOut>
      </>
    );
  }

  return <SignInMenuButton disabled={authDisabled} onSignIn={onSignIn} />;
}

function SignInMenuButton({
  disabled,
  onSignIn,
}: {
  readonly disabled: boolean;
  readonly onSignIn: () => void;
}) {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton disabled={disabled} onClick={onSignIn} type="button">
          <span className="flex-1">Sign in</span>
          <ArrowRightIcon />
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
