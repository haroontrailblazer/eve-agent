"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EnabledConnections } from "@/lib/chat/client-context";
import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";

export type { EnabledConnections } from "@/lib/chat/client-context";

// Shared app state from AppShell. Sidebar open state is not here: read it with
// useSidebar() from components/ui/sidebar.
type ChatShellContextValue = {
  readonly activeChatId: string | null;
  readonly enabledConnections: EnabledConnections;
  readonly removeChat: (chatId: string) => void;
  readonly requestSignIn: (draft?: string) => void;
  readonly setActiveChatId: (chatId: string | null) => void;
  readonly setConnectionEnabled: (
    connection: keyof EnabledConnections,
    enabled: boolean,
  ) => void;
  readonly setupStatus: SetupStatus;
  // SLACK_CONNECTOR is set, so the Slack channel is wired up. The sidebar and
  // the Channels page both read it from here.
  readonly slackConfigured: boolean;
  readonly touchChat: (chat: ChatListItem) => void;
  readonly viewer: Viewer | null;
  // The WHATSAPP_* settings are all present. The sidebar and the Channels page
  // both read it from here.
  readonly whatsappConfigured: boolean;
};

const ChatShellContext = createContext<ChatShellContextValue | null>(null);

export function ChatShellProvider({
  children,
  value,
}: {
  readonly children: ReactNode;
  readonly value: ChatShellContextValue;
}) {
  return <ChatShellContext.Provider value={value}>{children}</ChatShellContext.Provider>;
}

export function useChatShell() {
  const value = useContext(ChatShellContext);

  if (!value) {
    throw new Error("useChatShell must be used inside AppShell.");
  }

  return value;
}
