import type { ChatListItem, SetupStatus, Viewer } from "@/lib/chat/types";

export const CHAT_BOOTSTRAP_SYNC_EVENT = "eve-chat:bootstrap-sync";

export type ChatBootstrapSyncDetail = {
  readonly chats: readonly ChatListItem[];
  readonly nextCursor: string | null;
  readonly setupStatus: SetupStatus;
  // SLACK_CONNECTOR is set, so the Slack channel is wired up.
  readonly slackConfigured: boolean;
  readonly viewer: Viewer | null;
  // The WHATSAPP_* settings are all present, so the WhatsApp channel is wired up.
  readonly whatsappConfigured: boolean;
};
