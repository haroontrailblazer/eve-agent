"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createChatAction } from "@/app/actions/chat";
import { ChatSession } from "@/app/_components/chat/chat-session";
import { ComposerFooterControls } from "@/app/_components/chat/composer-footer-controls";
import { LegacyChatView } from "@/app/_components/chat/legacy-chat-view";
import { ThinkingMessage } from "@/app/_components/chat/thinking-message";
import { createLocalUserMessage } from "@/app/_components/chat/use-harpy-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import { ChatConversation, ChatConversationContent } from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import { showRequestError } from "@/components/harpy/show-request-error";
import {
  readPendingAttachments,
  writePendingAttachments,
  type Attachment,
} from "@/lib/chat/attachments";
import { shouldAutoSendPending } from "@/lib/chat/auto-send";
import {
  INITIAL_CHAT_LOAD,
  reduceChatLoad,
  type ChatLoadEvent,
  type ChatLoadState,
} from "@/lib/chat/chat-load";
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

const LOAD_FAILED_MESSAGE = "Couldn't load this chat. Refresh to try again.";

export function SessionChatPage({
  chatId,
  children,
}: {
  readonly chatId: string;
  readonly children: ReactNode;
}) {
  const { setActiveChatId, setupStatus, touchChat, viewer } = useChatShell();
  const [chatLoad, setChatLoad] = useState<ChatLoadState>(INITIAL_CHAT_LOAD);
  const [loadedChat, setLoadedChat] = useState<LoadedChat | null>(null);
  const [pendingUserMessage, setPendingUserMessage] = useState<string | null>(null);
  const currentChatIdRef = useRef(chatId);
  const loadedChatIdRef = useRef<string | null>(null);
  const provisionalCreateStartedRef = useRef(new Set<string>());
  const isProvisionalChat = isProvisionalChatId(chatId);
  const router = useRouter();

  useEffect(() => {
    currentChatIdRef.current = chatId;
  }, [chatId]);

  useEffect(() => {
    setChatLoad(INITIAL_CHAT_LOAD);
    setPendingUserMessage(null);
  }, [chatId]);

  useEffect(() => {
    const restoredPendingMessage = readPendingChatMessage(chatId);

    if (restoredPendingMessage) {
      setPendingUserMessage((current) => current ?? restoredPendingMessage);
    }
  }, [chatId]);

  useEffect(() => {
    if (!isProvisionalChat || !viewer || !setupStatus.appReady) {
      return;
    }

    const pendingMessage = readPendingChatMessage(chatId);

    if (!pendingMessage) {
      showRequestError("Message could not be restored. Start a new chat.");
      return;
    }

    setPendingUserMessage((current) => current ?? pendingMessage);

    if (provisionalCreateStartedRef.current.has(chatId)) {
      return;
    }

    provisionalCreateStartedRef.current.add(chatId);

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

        showRequestError(error instanceof Error ? error.message : "Failed to start chat.");
        router.replace("/chat", { scroll: false });
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

  // The chat is built only from this no-store fetch, never from the page's
  // server render: on back and forward the router can reuse a stale copy of
  // that render, with no session and no events (see lib/chat/chat-load.ts).
  useEffect(() => {
    if (!viewer || !setupStatus.appReady || isProvisionalChat) {
      return;
    }

    const abortController = new AbortController();
    let cancelled = false;
    const apply = (event: ChatLoadEvent) => {
      setChatLoad((current) => reduceChatLoad(chatId, current, event));
    };
    const fail = (message: string) => {
      showRequestError(message);
      apply({ message, type: "fetch-failed" });
    };

    void (async () => {
      try {
        const response = await fetch(`/api/chats/${encodeURIComponent(chatId)}`, {
          cache: "no-store",
          signal: abortController.signal,
        });

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          fail(response.status === 404 ? "Chat not found." : LOAD_FAILED_MESSAGE);
          return;
        }

        const data = (await response.json()) as { readonly chat: ActiveChat | null };

        if (cancelled) {
          return;
        }

        if (data.chat) {
          apply({ chat: data.chat, type: "fetched" });
        } else {
          fail("Chat not found.");
        }
      } catch {
        if (!cancelled && !abortController.signal.aborted) {
          fail(LOAD_FAILED_MESSAGE);
        }
      }
    })();

    return () => {
      cancelled = true;
      abortController.abort();
    };
  }, [chatId, isProvisionalChat, setupStatus.appReady, viewer]);

  const activeChat = chatLoad.status === "loaded" ? chatLoad.chat : null;

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

  const loaded = loadedChat?.chat.id === chatId ? loadedChat : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {loaded === null ? (
        <ChatLoadingView
          chatId={chatId}
          failure={chatLoad.status === "failed" ? chatLoad.message : null}
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
// When the chat could not be fetched, the composer says why and nothing sends.
function ChatLoadingView({
  chatId,
  failure,
  pendingUserMessage,
  setupStatus,
}: {
  readonly chatId: string;
  readonly failure: string | null;
  readonly pendingUserMessage: string | null;
  readonly setupStatus: SetupStatus;
}) {
  const disabledReason =
    getSetupDisabledReason(setupStatus) ??
    failure ??
    (pendingUserMessage ? "Sending message." : "Chat history is still loading.");

  return (
    <>
      {pendingUserMessage && failure === null ? (
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
