import { openConversationInputs, type ConversationState, type EveAuthorizationPart } from "eve/react";
import { getPendingAuthorizations } from "./authorization";

export type ChatStatus = "error" | "ready" | "resuming" | "streaming" | "submitted";

export type ChatViewState = {
  readonly isBusy: boolean;
  readonly isResuming: boolean;
  readonly isWaitingOnUser: boolean;
  readonly pendingAuthorizations: readonly EveAuthorizationPart[];
  readonly openInputIds: ReadonlySet<string>;
};

// What the chat UI should show for a hook status and its conversation. A turn
// parked on a question or a sign-in is waiting on the user, not busy.
export function deriveChatView(input: {
  readonly status: ChatStatus;
  readonly conversation: ConversationState;
}): ChatViewState {
  const openInputIds = new Set(
    openConversationInputs(input.conversation).map((entry) => entry.request.requestId),
  );
  const pendingAuthorizations = getPendingAuthorizations(input.conversation.messages);
  const isWaitingOnUser = openInputIds.size > 0 || pendingAuthorizations.length > 0;

  return {
    isBusy: (input.status === "submitted" || input.status === "streaming") && !isWaitingOnUser,
    isResuming: input.status === "resuming",
    isWaitingOnUser,
    openInputIds,
    pendingAuthorizations,
  };
}
