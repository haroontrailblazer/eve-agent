import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import type { ActiveChat } from "@/lib/chat/types";

export type ChatRowForView = {
  readonly id: string;
  readonly title: string;
  readonly legacy: boolean;
  readonly eveSession: ClientSessionState | null;
  readonly pendingUserMessage: string | null;
};

/**
 * Builds the chat the client renders. A legacy chat (saved before eve 0.82) is
 * read-only history: its session state belongs to the old transport and cannot
 * be resumed. Once a session exists the pending message has been sent, so only
 * a chat with no session still shows it.
 */
export function toActiveChat(
  row: ChatRowForView,
  events: readonly MessageStreamEvent[],
): ActiveChat {
  const session = row.legacy ? undefined : (row.eveSession ?? undefined);

  return {
    events,
    id: row.id,
    legacy: row.legacy,
    pendingUserMessage: row.legacy || session ? null : row.pendingUserMessage,
    session,
    title: row.title,
  };
}
