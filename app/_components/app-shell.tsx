"use client";

import { CheckIcon, UploadIcon } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import {
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { deleteChatAction } from "@/app/actions/chat";
import {
  CHAT_BOOTSTRAP_SYNC_EVENT,
  type ChatBootstrapSyncDetail,
} from "@/app/_components/agent-chat-events";
import { AppSidebar } from "@/app/_components/app-sidebar";
import {
  ChatShellProvider,
  type EnabledConnections,
} from "@/app/_components/chat-shell-context";
import { AuthDisplayLoggedOut } from "@/components/auth/auth-display";
import { SignInModal } from "@/components/auth/sign-in-modal";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";
import { APP_NAV, isNavItemActive } from "@/lib/nav";
import { parseSidebarOpen, readSidebarCookie, writeSidebarHint } from "@/lib/sidebar-hint";

// The app frame: the sidebar, a header row with the sidebar trigger, the page
// title and the page actions, then the page. It renders statically with
// cheap initial state; the (app) layout's bootstrap then reports the viewer,
// setup status and the first page of chats.
export function AppShell({
  children,
  setupStatus,
}: {
  readonly children: ReactNode;
  readonly setupStatus: SetupStatus;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [history, setHistory] = useState<ChatListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [authDialogOpen, setAuthDialogOpen] = useState(false);
  const [draftBeforeSignIn, setDraftBeforeSignIn] = useState("");
  const [signInCallbackPath, setSignInCallbackPath] = useState("/");
  const [viewerState, setViewerState] = useState<Viewer | null>(null);
  const [setupStatusState, setSetupStatusState] = useState(setupStatus);
  const [slackConfigured, setSlackConfigured] = useState(false);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [enabledConnections, setEnabledConnections] = useState<EnabledConnections>({
    linear: true,
    notion: true,
    sentry: true,
  });
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);
  const activeChatIdRef = useRef(activeChatId);
  const setupReady = setupStatusState.appReady;
  const router = useRouter();

  useEffect(() => {
    activeChatIdRef.current = activeChatId;
  }, [activeChatId]);

  useEffect(() => {
    cursorRef.current = nextCursor;
  }, [nextCursor]);

  // The hint script in <head> already collapsed the sidebar before first
  // paint. This brings React state in line before the first client paint.
  useLayoutEffect(() => {
    if (!parseSidebarOpen(readSidebarCookie(document.cookie))) {
      setSidebarOpen(false);
    }
  }, []);

  const handleSidebarOpenChange = useCallback((open: boolean) => {
    setSidebarOpen(open);
    writeSidebarHint(document, open);
  }, []);

  const requestSignIn = useCallback((draft?: string) => {
    setDraftBeforeSignIn(draft?.trim() ?? "");
    setSignInCallbackPath(window.location.pathname || "/");
    setAuthDialogOpen(true);
  }, []);

  const setConnectionEnabled = useCallback(
    (connection: keyof EnabledConnections, enabled: boolean) => {
      setEnabledConnections((current) => ({
        ...current,
        [connection]: enabled,
      }));
    },
    [],
  );

  const touchChat = useCallback((chat: ChatListItem) => {
    setHistory((items) => {
      const current = items.find((item) => item.id === chat.id);

      return [
        {
          id: chat.id,
          title: chat.title || current?.title || "New chat",
          updatedAt: chat.updatedAt,
        },
        ...items.filter((item) => item.id !== chat.id),
      ];
    });
  }, []);

  const removeChat = useCallback((chatId: string) => {
    setHistory((items) => items.filter((item) => item.id !== chatId));
  }, []);

  const selectChat = useCallback((chatId: string | null) => {
    activeChatIdRef.current = chatId;
    setActiveChatId(chatId);
  }, []);

  // Rejects when the delete fails, so the confirm dialog stays open and shows
  // the error.
  const handleDeleteChat = useCallback(
    async (chatId: string) => {
      await deleteChatAction(chatId);
      removeChat(chatId);

      if (activeChatIdRef.current === chatId) {
        selectChat(null);
        router.push("/chat", { scroll: false });
      }
    },
    [removeChat, router, selectChat],
  );

  const loadMoreChats = useCallback(async () => {
    const cursor = cursorRef.current;

    if (!cursor || loadingMoreRef.current) {
      return true;
    }

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const response = await fetch(`/api/chats?cursor=${encodeURIComponent(cursor)}`);

      if (!response.ok) {
        return false;
      }

      const data = (await response.json()) as {
        readonly chats?: readonly ChatListItem[];
        readonly nextCursor?: string | null;
      };
      const incoming = data.chats ?? [];

      setHistory((items) => {
        const existing = new Set(items.map((item) => item.id));
        const fresh = incoming.filter((item) => !existing.has(item.id));

        return [...items, ...fresh];
      });
      cursorRef.current = data.nextCursor ?? null;
      setNextCursor(data.nextCursor ?? null);
      return true;
    } catch {
      return false;
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  }, []);

  const setBootstrapData = useCallback(
    ({
      chats,
      nextCursor: incomingNextCursor,
      setupStatus: incomingSetupStatus,
      slackConfigured: incomingSlackConfigured,
      viewer: incomingViewer,
    }: ChatBootstrapSyncDetail) => {
      setSetupStatusState(incomingSetupStatus);
      setViewerState(incomingViewer);
      setSlackConfigured(incomingSlackConfigured);
      setHistory((items) => (incomingViewer ? mergeChatHistory(chats, items) : []));
      setNextCursor(incomingNextCursor);
      setHistoryLoading(false);
      cursorRef.current = incomingNextCursor;
    },
    [],
  );

  useEffect(() => {
    const target = window as Window & {
      __eveChatBootstrapSync?: ChatBootstrapSyncDetail;
    };
    const handleBootstrapSync = (event: Event) => {
      setBootstrapData((event as CustomEvent<ChatBootstrapSyncDetail>).detail);
    };

    window.addEventListener(CHAT_BOOTSTRAP_SYNC_EVENT, handleBootstrapSync);
    if (target.__eveChatBootstrapSync) {
      setBootstrapData(target.__eveChatBootstrapSync);
    }

    return () => {
      window.removeEventListener(CHAT_BOOTSTRAP_SYNC_EVENT, handleBootstrapSync);
    };
  }, [setBootstrapData]);

  const contextValue = useMemo(
    () => ({
      activeChatId,
      enabledConnections,
      removeChat,
      requestSignIn,
      setActiveChatId,
      setConnectionEnabled,
      setupStatus: setupStatusState,
      slackConfigured,
      touchChat,
      viewer: viewerState,
    }),
    [
      activeChatId,
      enabledConnections,
      removeChat,
      requestSignIn,
      setConnectionEnabled,
      setupStatusState,
      slackConfigured,
      touchChat,
      viewerState,
    ],
  );

  const authActions = viewerState ? null : historyLoading ? (
    <AuthDisplayLoggedOut>
      <AuthHeaderActions onSignIn={() => requestSignIn()} />
    </AuthDisplayLoggedOut>
  ) : (
    <AuthHeaderActions onSignIn={() => requestSignIn()} />
  );

  return (
    <ChatShellProvider value={contextValue}>
      <SidebarProvider
        className="h-dvh overflow-hidden"
        onOpenChange={handleSidebarOpenChange}
        open={sidebarOpen}
      >
        <AppSidebar
          activeChatId={activeChatId}
          chats={history}
          hasMoreChats={Boolean(nextCursor)}
          isLoadingChats={historyLoading}
          isLoadingMore={loadingMore}
          onDeleteChat={handleDeleteChat}
          onLoadMoreChats={loadMoreChats}
          onSelectChat={selectChat}
          onSignIn={() => requestSignIn()}
          setupStatus={setupStatusState}
          slackConfigured={slackConfigured}
          viewer={viewerState}
        />
        <SidebarInset className="min-w-0 overflow-y-auto">
          <AppHeader actions={authActions} />
          {children}
        </SidebarInset>
        <SignInModal
          callbackPath={signInCallbackPath}
          disabled={!setupReady}
          onBeforeSignIn={() => {
            if (draftBeforeSignIn) {
              window.sessionStorage.setItem("eve-chat-draft", draftBeforeSignIn);
            }
          }}
          onOpenChange={setAuthDialogOpen}
          open={authDialogOpen}
        />
      </SidebarProvider>
    </ChatShellProvider>
  );
}

// The page frame's header row: the sidebar trigger, the title of the current
// section and the page actions. The chat Share button lives here on a chat.
// The parts that read the pathname sit in Suspense, because usePathname
// suspends while /chat/[id] prerenders (cacheComponents).
function AppHeader({ actions }: { readonly actions: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 flex h-12 shrink-0 items-center gap-2 bg-background px-2 md:px-3">
      <SidebarTrigger
        aria-label="Toggle sidebar"
        className="text-muted-foreground hover:text-foreground"
      />
      <Suspense fallback={null}>
        <HeaderTitle />
      </Suspense>
      <div className="ml-auto flex min-w-0 items-center justify-end gap-1.5">
        <Suspense fallback={null}>
          <ChatRouteShareButton />
        </Suspense>
        {actions}
      </div>
    </header>
  );
}

function HeaderTitle() {
  const pathname = usePathname();
  const title = APP_NAV.find((item) => isNavItemActive(item.href, pathname))?.label;

  if (!title) {
    return null;
  }

  return (
    <>
      <Separator className="data-[orientation=vertical]:h-4" orientation="vertical" />
      <span className="min-w-0 truncate px-1 text-small font-medium text-foreground">{title}</span>
    </>
  );
}

function ChatRouteShareButton() {
  const pathname = usePathname();

  return pathname.startsWith("/chat/") ? <ShareChatButton /> : null;
}

function ShareChatButton() {
  const [copied, setCopied] = useState(false);
  const copyResetTimerRef = useRef<number | null>(null);

  const clearCopyResetTimer = useCallback(() => {
    if (copyResetTimerRef.current === null) {
      return;
    }

    window.clearTimeout(copyResetTimerRef.current);
    copyResetTimerRef.current = null;
  }, []);

  const handleCopyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      clearCopyResetTimer();
      setCopied(true);
      copyResetTimerRef.current = window.setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopied(false);
      }, 1600);
    } catch {
      setCopied(false);
    }
  }, [clearCopyResetTimer]);

  useEffect(() => clearCopyResetTimer, [clearCopyResetTimer]);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          aria-label={copied ? "Copied chat link" : "Copy chat link"}
          className="text-muted-foreground hover:text-foreground"
          onClick={handleCopyLink}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {copied ? <CheckIcon className="size-4" /> : <UploadIcon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{copied ? "Copied" : "Copy link"}</TooltipContent>
    </Tooltip>
  );
}

// harpy is private to allowlisted emails, so there is no sign up: only log in.
function AuthHeaderActions({ onSignIn }: { readonly onSignIn: () => void }) {
  return (
    <Button className="h-8 px-3" onClick={onSignIn} type="button" variant="outline">
      Log in
    </Button>
  );
}

function mergeChatHistory(
  incoming: readonly ChatListItem[],
  current: readonly ChatListItem[],
) {
  const incomingById = new Map(incoming.map((item) => [item.id, item]));
  const currentIds = new Set(current.map((item) => item.id));
  const freshIncoming = incoming.filter((item) => !currentIds.has(item.id));

  return [...freshIncoming, ...current.map((item) => incomingById.get(item.id) ?? item)];
}
