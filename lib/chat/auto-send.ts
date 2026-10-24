import type { ActiveChat } from "./types";

/**
 * True when a loaded chat still has to send its first message: the home page
 * handed it over in this tab, and no eve session has started for it yet. A
 * legacy chat is read-only and never sends.
 *
 * Server data alone is not enough. A stale copy of the chat (the router cache
 * on back/forward, or a load that lands before the session is saved) still
 * shows the pending message with no session, and sending it again would start
 * a second eve session. So the local handoff marker the home page writes to
 * sessionStorage must also be present.
 */
export function shouldAutoSendPending(
  chat: Pick<ActiveChat, "legacy" | "pendingUserMessage" | "session">,
  hasLocalHandoff: boolean,
): boolean {
  return (
    hasLocalHandoff &&
    !chat.legacy &&
    chat.session === undefined &&
    (chat.pendingUserMessage?.trim() ?? "").length > 0
  );
}
