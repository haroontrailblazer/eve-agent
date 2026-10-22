"use server";

import type { ClientSessionState } from "eve/client";
import {
  appendChatEvents,
  createChat,
  deleteChatForUser,
  finalizeChatTurn,
  listChatsByUser,
  markChatPendingMessage,
  saveChatSession,
} from "@/lib/db/queries";
import type { IndexedChatEvent } from "@/lib/chat/event-rows";
import { assertChatMessageLength } from "@/lib/chat/limits";
import type { ChatListItem } from "@/lib/chat/types";
import { RateLimitError, enforceRateLimit } from "@/lib/rate-limit";
import { getServerViewer } from "@/lib/session";

const SEND_LIMIT = 25;
const SEND_WINDOW_SECONDS = 60 * 60;

export async function createChatAction(input?: { readonly pendingUserMessage?: string }) {
  const viewer = await requireViewer();

  if (input?.pendingUserMessage) {
    assertChatMessageLength(input.pendingUserMessage);
  }

  await enforceRateLimit({
    key: viewer.id,
    limit: SEND_LIMIT,
    prefix: "chat:create",
    windowSeconds: SEND_WINDOW_SECONDS,
  });

  return createChat(viewer.id, {
    pendingUserMessage: input?.pendingUserMessage,
  });
}

export async function checkSendLimitAction(input?: { readonly message?: string }) {
  const viewer = await requireViewer();

  try {
    if (input?.message) {
      assertChatMessageLength(input.message);
    }

    await enforceRateLimit({
      key: viewer.id,
      limit: SEND_LIMIT,
      prefix: "chat:send",
      windowSeconds: SEND_WINDOW_SECONDS,
    });

    return { allowed: true as const };
  } catch (error) {
    if (error instanceof RateLimitError) {
      return {
        allowed: false as const,
        message: error.message,
        retryAfter: error.retryAfter,
      };
    }

    throw error;
  }
}

export async function markChatPendingMessageAction(input: {
  readonly chatId: string;
  readonly message: string;
}): Promise<ChatListItem> {
  const viewer = await requireViewer();

  assertChatMessageLength(input.message);

  return markChatPendingMessage({
    chatId: input.chatId,
    message: input.message,
    userId: viewer.id,
  });
}

export async function appendChatEventsAction(input: {
  chatId: string;
  events: readonly IndexedChatEvent[];
}): Promise<{ ok: true }> {
  const viewer = await requireViewer();

  assertChatId(input.chatId);

  await appendChatEvents({
    chatId: input.chatId,
    events: input.events,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function saveChatSessionAction(input: {
  chatId: string;
  session: ClientSessionState;
}): Promise<{ ok: true }> {
  const viewer = await requireViewer();

  assertChatId(input.chatId);

  await saveChatSession({
    chatId: input.chatId,
    session: input.session,
    userId: viewer.id,
  });

  return { ok: true };
}

export async function finalizeChatTurnAction(input: {
  chatId: string;
  session: ClientSessionState | null;
}): Promise<ChatListItem> {
  const viewer = await requireViewer();

  assertChatId(input.chatId);

  const item = await finalizeChatTurn({
    chatId: input.chatId,
    session: input.session,
    userId: viewer.id,
  });

  if (!item) {
    throw new Error("Chat not found.");
  }

  return item;
}

export async function deleteChatAction(chatId: string) {
  const viewer = await requireViewer();

  await deleteChatForUser(chatId, viewer.id);

  return listChatsByUser(viewer.id);
}

function assertChatId(chatId: string) {
  if (typeof chatId !== "string" || chatId.trim() === "") {
    throw new Error("Chat id is required.");
  }
}

async function requireViewer() {
  const viewer = await getServerViewer();

  if (!viewer) {
    throw new Error("Sign in with Vercel to continue.");
  }

  return viewer;
}
