import type { ActiveChat } from "./types";

/**
 * True when a loaded chat still has to send its first message: the home page
 * handed it over, and no eve session has started for it yet. A legacy chat is
 * read-only and never sends.
 */
export function shouldAutoSendPending(
  chat: Pick<ActiveChat, "legacy" | "pendingUserMessage" | "session">,
): boolean {
  return (
    !chat.legacy &&
    chat.session === undefined &&
    (chat.pendingUserMessage?.trim() ?? "").length > 0
  );
}
