"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createChatAction } from "@/app/actions/chat";
import {
  CHAT_ROUTE_SYNC_EVENT,
  type ChatRouteSyncDetail,
} from "@/app/_components/agent-chat-events";
import { ChatSession } from "@/app/_components/chat/chat-session";
import { ComposerFooterControls } from "@/app/_components/chat/composer-footer-controls";
import { ErrorToast } from "@/app/_components/chat/error-toast";
import { LegacyChatView } from "@/app/_components/chat/legacy-chat-view";
import { ThinkingMessage } from "@/app/_components/chat/thinking-message";
import { createLocalUserMessage } from "@/app/_components/chat/use-harpy-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import { ChatConversation, ChatConversationContent } from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import {
  readPendingAttachments,
  writePendingAttachments,
  type Attachment,
} from "@/lib/chat/attachments";
import { shouldAutoSendPending } from "@/lib/chat/auto-send";
import { hasOpenTurn } from "@/lib/chat/events";
import {
  clearPendingChatMessage,
  isProvisionalChatId,
  readPendingChatMessage,
  writePendingChatMessage,
} from "@/lib/chat/provisional-chat";
import { getSetupDisabledReason } from "@/lib/chat/setup-reason";
import type { ActiveChat, SetupStatus } from "@/lib/chat/types";

type LoadedChat = {
  readonly autoSend: {
    readonly attachments: readonly Attachment[];
    readonly message: string;
  } | null;
  readonly chat: ActiveChat;
};

export function SessionChatPage({
  chatId,
  children,
}: {
  readonly chatId: string;
  readonly children: ReactNode;
}) {
  const { setActiveChatId, setupStatus, touchChat, viewer } = useChatShell();
  const [activeChat, setActiveChat] = useState<ActiveChat | null>(null);
  const [loadedChat, setLoadedChat] = useState<LoadedChat | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState<string | null>(null);
  const currentChatIdRef = useRef(chatId);
  const loadedChatIdRef = useRef<string | null>(null);
  const provisionalCreateStartedRef = useRef(new Set<string>());
  const isProvisionalChat = isProvisionalChatId(chatId);
  const router = useRouter();
  const toastError = clientError && dismissedError !== clientError ? clientError : null;

  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    setActiveChat(null);
    setPendingUserMessage(null);
  }, [chatId]);

  useEffect(() => {
    const restoredPendingMessage = readPendingChatMessage(chatId);

    if (restoredPendingMessage) {
      setPendingUserMessage((current) => current ?? restoredPendingMessage);
      setClientError(null);
    }
  }, [chatId]);

  useEffect(() => {
    if (!isProvisionalChat || !viewer || !setupStatus.appReady) {
      return;
    }

    const pendingMessage = readPendingChatMessage(chatId);

    if (!pendingMessage) {
      setClientError("Message could not be restored. Start a new chat.");
      return;
    }

    setPendingUserMessage((current) => current ?? pendingMessage);

    if (provisionalCreateStartedRef.current.has(chatId)) {
      return;
    }

    provisionalCreateStartedRef.current.add(chatId);
    setClientError(null);

    void (async () => {
      try {
        const created = await createChatAction({ pendingUserMessage: pendingMessage });

        if (currentChatIdRef.current !== chatId) {
          return;
        }

        const carriedAttachments = readPendingAttachments(chatId);
        if (carriedAttachments.length > 0) {
          writePendingAttachments(created.id, carriedAttachments);
        }
        writePendingChatMessage(created.id, pendingMessage);
        clearPendingChatMessage(chatId);
        touchChat(created);
        setActiveChatId(created.id);
        router.replace(`/chat/${created.id}`, { scroll: false });
      } catch (error) {
        if (currentChatIdRef.current !== chatId) {
          return;
        }

        clearPendingChatMessage(chatId);
        setPendingUserMessage(null);

        try {
          window.sessionStorage.setItem("eve-chat-draft", pendingMessage);
        } catch {}

        setClientError(error instanceof Error ? error.message : "Failed to start chat.");
        router.replace("/", { scroll: false });
      }
    })();
  }, [
    chatId,
    isProvisionalChat,
    router,
    setActiveChatId,
    setupStatus.appReady,
    touchChat,
    viewer,
  ]);

  useEffect(() => {
    setActiveChatId(chatId);

    return () => {
      setActiveChatId(null);
    };
  }, [chatId, setActiveChatId]);

  useEffect(() => {
    const applyRouteSync = (detail: ChatRouteSyncDetail) => {
      if (detail.chatId !== chatId) {
        return;
      }
      setActiveChat((current) => {
        if (!detail.activeChat && current?.id === chatId) {
          return current;
        }

        if (shouldKeepCurrentActiveChat(current, detail.activeChat, chatId)) {
          return current;
        }

        return detail.activeChat;
      });
    };
    const target = window as Window & {
      __eveChatRouteSync?: ChatRouteSyncDetail;
    };
    const handleRouteSync = (event: Event) => {
      applyRouteSync((event as CustomEvent<ChatRouteSyncDetail>).detail);
    };

    window.addEventListener(CHAT_ROUTE_SYNC_EVENT, handleRouteSync);
    if (target.__eveChatRouteSync) {
      applyRouteSync(target.__eveChatRouteSync);
    }

    return () => {
      window.removeEventListener(CHAT_ROUTE_SYNC_EVENT, handleRouteSync);
    };
  }, [chatId]);

  useEffect(() => {
    if (!viewer || !setupStatus.appReady || isProvisionalChat) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
          signal: abortController.signal,
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setClientError(
            response.status === 404
              ? "Chat not found."
              : "Failed to load chat history.",
          );
          return;
        }

        const data = (await response.json()) as { readonly chat: ActiveChat | null };

        if (cancelled) {
          return;
        }

        setActiveChat((current) =>
          shouldKeepCurrentActiveChat(current, data.chat, chatId) ? current : data.chat,
        );
        setClientError(null);
      } catch (error) {
        if (!cancelled && !abortController.signal.aborted) {
          setClientError(
            error instanceof Error ? error.message : "Failed to load chat history.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [chatId, isProvisionalChat, setupStatus.appReady, viewer]);

  // Settles once per chat whether it sends its pending first message. Reading
  // the pending attachments removes them from storage, so this runs in an
  // effect: Strict Mode renders twice, and the second read would find nothing.
  // The local handoff marker is read before it is cleared, so only the tab that
  // handed the message over sends it, never a stale copy of the chat.
  useEffect(() => {
    if (!activeChat || loadedChatIdRef.current === activeChat.id) {
      return;
    }

    loadedChatIdRef.current = activeChat.id;

    const hasLocalHandoff = readPendingChatMessage(activeChat.id) !== null;
    const message = activeChat.pendingUserMessage;
    const autoSend =
      message !== null && shouldAutoSendPending(activeChat, hasLocalHandoff)
        ? { attachments: readPendingAttachments(activeChat.id), message }
        : null;

    clearPendingChatMessage(activeChat.id);
    setLoadedChat({ autoSend, chat: activeChat });
  }, [activeChat]);

  useEffect(() => {
    setDismissedError(null);
  }, [clientError]);

  const loaded = loadedChat?.chat.id === chatId ? loadedChat : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {toastError ? (
        <ErrorToast
          message={toastError}
          onDismiss={() => setDismissedError(toastError)}
        />
      ) : null}

      {loaded === null ? (
        <ChatLoadingView
          chatId={chatId}
          pendingUserMessage={pendingUserMessage}
          setupStatus={setupStatus}
        />
      ) : loaded.chat.legacy ? (
        <LegacyChatView chat={loaded.chat} />
      ) : (
        <ChatSession autoSend={loaded.autoSend} chat={loaded.chat} key={loaded.chat.id} />
      )}

      <div className="hidden" aria-hidden>
        {children}
      </div>
    </div>
  );
}

const isInputOpen = () => false;
const noop = () => {};

// Shown until the chat loads. A message handed over from the home page shows
// at once, with "Thinking...", so the page does not jump when the chat loads.
function ChatLoadingView({
  chatId,
  pendingUserMessage,
  setupStatus,
}: {
  readonly chatId: string;
  readonly pendingUserMessage: string | null;
  readonly setupStatus: SetupStatus;
}) {
  const disabledReason =
    getSetupDisabledReason(setupStatus) ??
    (pendingUserMessage ? "Sending message." : "Chat history is still loading.");

  return (
    <>
      <div className="h-12 shrink-0" />
      {pendingUserMessage ? (
        <ChatConversation>
          <ChatConversationContent>
            <AgentMessage
              canRespond={false}
              isCancelling={false}
              isInputOpen={isInputOpen}
              isStreaming={false}
              message={createLocalUserMessage(`${chatId}:pending`, pendingUserMessage)}
              onCancelTurn={noop}
              onInputResponses={noop}
            />
            <ThinkingMessage isVisible />
          </ChatConversationContent>
        </ChatConversation>
      ) : (
        <div className="min-h-0 flex-1" />
      )}

      <div className="shrink-0 pb-4 sm:pb-6">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <ChatComposer
            disabled
            disabledReason={disabledReason}
            footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
            onChange={noop}
            onStop={noop}
            onSubmit={noop}
            value=""
          />
        </div>
      </div>
    </>
  );
}

// Never replace the current chat with a STALER snapshot for the same chat: a
// late /api/chats fetch or route-sync must not clobber the freshly-completed
// turn (which would blank the answer and relight "Thinking..." until a refresh).
function shouldKeepCurrentActiveChat(
  current: ActiveChat | null,
  next: ActiveChat | null,
  chatId: string,
): boolean {
  if (!current || current.id !== chatId || !next || next.id !== chatId) {
    return false;
  }

  if (next.events.length < current.events.length) {
    return true;
  }

  return hasOpenTurn(next.events) && !hasOpenTurn(current.events);
}
