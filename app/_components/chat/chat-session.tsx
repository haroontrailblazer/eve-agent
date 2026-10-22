"use client";

import type { EveMessage } from "eve/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { ComposerFooterControls } from "@/app/_components/chat/composer-footer-controls";
import { ThinkingMessage, useThinkingPresence } from "@/app/_components/chat/thinking-message";
import { useHarpyChat } from "@/app/_components/chat/use-harpy-chat";
import { useChatShell } from "@/app/_components/chat-shell-context";
import { ChatComposer } from "@/components/chat/composer";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import { showRequestError } from "@/components/harpy/show-request-error";
import { filesToAttachments, type Attachment } from "@/lib/chat/attachments";
import { getAuthorizationDisabledReason } from "@/lib/chat/authorization";
import { getSetupDisabledReason } from "@/lib/chat/setup-reason";
import type { ActiveChat } from "@/lib/chat/types";

/** A loaded chat: its conversation and the composer. Mount with `key={chat.id}`. */
export function ChatSession({
  autoSend,
  chat,
}: {
  readonly chat: ActiveChat;
  readonly autoSend: {
    readonly message: string;
    readonly attachments: readonly Attachment[];
  } | null;
}) {
  const { setupStatus, touchChat } = useChatShell();
  const [draft, setDraft] = useState("");
  const harpy = useHarpyChat({ chat, onError: showRequestError, onTurnSettled: touchChat });
  const autoSentRef = useRef(false);
  const { cancel, send } = harpy;

  // Calls send synchronously, so its message bubble shows in the same render.
  const sendMessage = useCallback(
    async (text: string, attachments: readonly Attachment[]) => {
      try {
        if (!(await send(text, attachments))) {
          setDraft(text);
        }
      } catch (error) {
        setDraft(text);
        showRequestError(error instanceof Error ? error.message : "Failed to send message.");
      }
    },
    [send],
  );

  const handleSubmit = useCallback(
    async (text: string, files: File[]) => {
      setDraft("");
      let attachments: readonly Attachment[] = [];

      if (files.length > 0) {
        try {
          attachments = await filesToAttachments(files);
        } catch {
          setDraft(text);
          showRequestError("Failed to read the attached files.");
          return;
        }
      }

      await sendMessage(text, attachments);
    },
    [sendMessage],
  );

  const stop = useCallback(() => {
    void cancel();
  }, [cancel]);

  // Sends the message handed over from the home page, once. A layout effect,
  // so the message bubble is there in the first paint of the session.
  useLayoutEffect(() => {
    if (autoSend === null || autoSentRef.current) {
      return;
    }

    autoSentRef.current = true;
    void sendMessage(autoSend.message, autoSend.attachments);
  }, [autoSend, sendMessage]);

  const setupReason = getSetupDisabledReason(setupStatus);
  const disabledReason =
    setupReason ??
    (harpy.isResuming ? "Chat history is still loading." : undefined) ??
    getAuthorizationDisabledReason(harpy.pendingAuthorizations) ??
    (harpy.isBusy ? "harpy is responding." : undefined);
  const canRespond = !harpy.isResuming && setupReason === undefined;
  // An assistant message with no content yet renders nothing; "Thinking..."
  // stands in for it.
  const visibleMessages = harpy.messages.filter((message) => !isEmptyAssistantMessage(message));
  const lastMessage = visibleMessages.at(-1);
  const thinking = useThinkingPresence(harpy.isBusy && lastMessage?.role !== "assistant");
  const isEmpty = visibleMessages.length === 0 && !thinking.shouldRender;

  return (
    <>
      <div className="h-12 shrink-0" />
      {isEmpty ? (
        <div className="min-h-0 flex-1" />
      ) : (
        <ChatConversation>
          <ChatConversationContent>
            {visibleMessages.map((message, index) => (
              <AgentMessage
                canRespond={canRespond}
                isCancelling={harpy.isCancelling}
                isInputOpen={(requestId) => harpy.openInputIds.has(requestId)}
                isStreaming={harpy.isBusy && index === visibleMessages.length - 1}
                key={message.id}
                message={message}
                onCancelTurn={stop}
                onInputResponses={harpy.respond}
              />
            ))}
            {thinking.shouldRender ? <ThinkingMessage isVisible={thinking.isVisible} /> : null}
          </ChatConversationContent>
          <ChatScrollButton />
        </ChatConversation>
      )}

      <div className="shrink-0 pb-4 sm:pb-6">
        <div className="mx-auto w-full max-w-2xl px-4 sm:px-6">
          <ChatComposer
            disabled={disabledReason !== undefined}
            disabledReason={disabledReason}
            footerStart={<ComposerFooterControls setupStatus={setupStatus} />}
            isBusy={harpy.isBusy}
            onChange={setDraft}
            onStop={stop}
            onSubmit={handleSubmit}
            value={draft}
          />
        </div>
      </div>
    </>
  );
}

function isEmptyAssistantMessage(message: EveMessage) {
  return message.role === "assistant" && message.parts.every((part) => part.type === "step-start");
}
