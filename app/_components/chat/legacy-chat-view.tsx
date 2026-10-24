"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  ChatConversation,
  ChatConversationContent,
  ChatScrollButton,
} from "@/components/chat/conversation";
import { AgentMessage } from "@/components/chat/message";
import { Button } from "@/components/ui/button";
import { reduceLegacyEvents } from "@/lib/chat/legacy";
import type { ActiveChat } from "@/lib/chat/types";

const isInputOpen = () => false;
const noop = () => {};

/** A chat saved by an older version of harpy: read-only, with no composer. */
export function LegacyChatView({ chat }: { readonly chat: ActiveChat }) {
  const messages = useMemo(() => reduceLegacyEvents(chat.events), [chat.events]);

  return (
    <>
      {messages === null ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-4">
          <p className="max-w-sm text-center text-sm text-muted-foreground">
            {"This chat is from an older version of harpy and can't be shown."}
          </p>
        </div>
      ) : (
        <ChatConversation>
          <ChatConversationContent>
            {messages.map((message) => (
              <AgentMessage
                canRespond={false}
                isCancelling={false}
                isInputOpen={isInputOpen}
                isStreaming={false}
                key={message.id}
                legacy
                message={message}
                onCancelTurn={noop}
                onInputResponses={noop}
              />
            ))}
          </ChatConversationContent>
          <ChatScrollButton />
        </ChatConversation>
      )}

      <div className="shrink-0 pb-4 sm:pb-6">
        <div className="mx-auto flex w-full max-w-2xl flex-col items-center gap-3 px-4 text-center sm:flex-row sm:justify-between sm:px-6 sm:text-left">
          <p className="text-sm text-muted-foreground">
            This chat is from an older version of harpy. Start a new chat to continue.
          </p>
          <Button asChild size="sm">
            <Link href="/chat">New chat</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
