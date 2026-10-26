"use client";

import { useEffect } from "react";
import {
  CHAT_BOOTSTRAP_SYNC_EVENT,
  type ChatBootstrapSyncDetail,
} from "@/app/_components/agent-chat-events";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";

export function AgentChatBootstrapSync({
  chats,
  nextCursor,
  setupStatus,
  slackConfigured,
  viewer,
  whatsappConfigured,
}: {
  readonly chats: readonly ChatListItem[];
  readonly nextCursor: string | null;
  readonly setupStatus: SetupStatus;
  readonly slackConfigured: boolean;
  readonly viewer: Viewer | null;
  readonly whatsappConfigured: boolean;
}) {
  useEffect(() => {
    const detail: ChatBootstrapSyncDetail = {
      chats,
      nextCursor,
      setupStatus,
      slackConfigured,
      viewer,
      whatsappConfigured,
    };
    const target = window as Window & {
      __eveChatBootstrapSync?: ChatBootstrapSyncDetail;
    };

    target.__eveChatBootstrapSync = detail;
    window.dispatchEvent(
      new CustomEvent(CHAT_BOOTSTRAP_SYNC_EVENT, {
        detail,
      }),
    );
  }, [chats, nextCursor, setupStatus, slackConfigured, viewer, whatsappConfigured]);

  return null;
}
