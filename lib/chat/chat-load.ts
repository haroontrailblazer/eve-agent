import type { ActiveChat } from "./types";

/**
 * Where the chat page is in loading one chat.
 *
 * Only the no-store /api/chats/:id fetch settles it. The page's server render
 * is not a source: on back and forward, Next can reuse the first visit's cached
 * payload, which has no session and no events. A chat built from that copy
 * shows empty, and its next message starts a second eve session over the saved
 * one, whose events then collide on their indexes and are dropped.
 */
export type ChatLoadState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly chat: ActiveChat }
  | { readonly status: "failed"; readonly message: string };

export type ChatLoadEvent =
  | { readonly type: "fetched"; readonly chat: ActiveChat }
  | { readonly type: "fetch-failed"; readonly message: string };

export const INITIAL_CHAT_LOAD: ChatLoadState = { status: "loading" };

/**
 * Applies a fetch answer for `chatId`. The first chat fetched settles the load
 * for good: the session is built from it once, so a later answer never
 * replaces it. A failure leaves the load unsettled, and a retried fetch can
 * still settle it.
 */
export function reduceChatLoad(
  chatId: string,
  state: ChatLoadState,
  event: ChatLoadEvent,
): ChatLoadState {
  if (state.status === "loaded") {
    return state;
  }

  if (event.type === "fetch-failed") {
    return { message: event.message, status: "failed" };
  }

  return event.chat.id === chatId ? { chat: event.chat, status: "loaded" } : state;
}
