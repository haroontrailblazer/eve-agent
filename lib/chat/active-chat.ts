import type { ClientSessionState } from "eve/client";
import type { IndexedChatEvent } from "@/lib/chat/event-rows";
import type { ActiveChat } from "@/lib/chat/types";

export type ChatRowForView = {
  readonly id: string;
  readonly title: string;
  readonly legacy: boolean;
  readonly eveSession: ClientSessionState | null;
  readonly pendingUserMessage: string | null;
};

/**
 * Builds the chat the client renders from its row and its saved events, in
 * index order. A legacy chat (saved before eve 0.82) is read-only history: its
 * session state belongs to the old transport and cannot be resumed. Once a
 * session exists the pending message has been sent, so only a chat with no
 * session still shows it.
 *
 * New events continue after the highest saved index, not after the number of
 * saved events, so a gap in the log never makes a new event reuse a taken
 * index (the insert would drop it silently).
 */
export function toActiveChat(
  row: ChatRowForView,
  savedEvents: readonly IndexedChatEvent[],
): ActiveChat {
  const session = row.legacy ? undefined : (row.eveSession ?? undefined);
  const nextEventIndex = savedEvents.reduce(
    (next, saved) => Math.max(next, saved.index + 1),
    0,
  );

  return {
    events: savedEvents.map((saved) => saved.event),
    id: row.id,
    legacy: row.legacy,
    nextEventIndex,
    pendingUserMessage: row.legacy || session ? null : row.pendingUserMessage,
    session,
    title: row.title,
  };
}
