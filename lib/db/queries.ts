import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import type { ClientSessionState } from "eve/client";
import { toActiveChat } from "@/lib/chat/active-chat";
import { toChatEventRows, type IndexedChatEvent } from "@/lib/chat/event-rows";
import type { ActiveChat, ChatListItem, ChatListPage } from "@/lib/chat/types";
import { createFallbackTitle, DEFAULT_CHAT_TITLE } from "@/lib/chat/title";
import { chat, chatEvent } from "@/lib/db/schema";
import { db } from "@/lib/db/client";

const CHAT_HISTORY_PAGE_SIZE = 20;

function encodeChatCursor(updatedAt: Date, id: string) {
  return `${updatedAt.toISOString()}::${id}`;
}

function decodeChatCursor(cursor: string) {
  const [updatedAtRaw, id] = cursor.split("::");

  if (!updatedAtRaw || !id) {
    return null;
  }

  const updatedAt = new Date(updatedAtRaw);

  if (Number.isNaN(updatedAt.getTime())) {
    return null;
  }

  return { id, updatedAt };
}

export async function listChatsByUser(userId: string): Promise<ChatListItem[]> {
  const page = await listChatsPageByUser(userId);

  return [...page.items];
}

export async function listChatsPageByUser(
  userId: string,
  cursor?: string | null,
): Promise<ChatListPage> {
  const cursorValue = cursor?.trim();
  const parsedCursor = cursorValue ? decodeChatCursor(cursorValue) : null;
  const rows = await db
    .select({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    })
    .from(chat)
    .where(
      and(
        eq(chat.userId, userId),
        parsedCursor
          ? or(
              lt(chat.updatedAt, parsedCursor.updatedAt),
              and(eq(chat.updatedAt, parsedCursor.updatedAt), lt(chat.id, parsedCursor.id)),
            )
          : undefined,
      ),
    )
    .orderBy(desc(chat.updatedAt), desc(chat.id))
    .limit(CHAT_HISTORY_PAGE_SIZE + 1);

  const hasMore = rows.length > CHAT_HISTORY_PAGE_SIZE;
  const pageRows = hasMore ? rows.slice(0, CHAT_HISTORY_PAGE_SIZE) : rows;
  const last = pageRows[pageRows.length - 1];

  return {
    items: pageRows.map((row) => ({
      id: row.id,
      title: row.title,
      updatedAt: row.updatedAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodeChatCursor(last.updatedAt, last.id) : null,
  };
}

export async function createChat(
  userId: string,
  {
    pendingUserMessage,
  }: {
    readonly pendingUserMessage?: string;
  } = {},
) {
  const pendingMessage = pendingUserMessage?.trim();
  const pendingMessageCreatedAt = pendingMessage ? new Date() : null;
  const [row] = await db
    .insert(chat)
    .values({
      id: randomUUID(),
      pendingUserMessage: pendingMessage || null,
      pendingUserMessageCreatedAt: pendingMessageCreatedAt,
      title: pendingMessage ? createFallbackTitle(pendingMessage) : DEFAULT_CHAT_TITLE,
      userId,
    })
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Failed to create chat.");
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getChatForUser(chatId: string, userId: string): Promise<ActiveChat | null> {
  const [row] = await db
    .select({
      id: chat.id,
      title: chat.title,
      legacy: chat.legacy,
      eveSession: chat.eveSession,
      pendingUserMessage: chat.pendingUserMessage,
    })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!row) {
    return null;
  }

  const events = await db
    .select({ event: chatEvent.event })
    .from(chatEvent)
    .where(eq(chatEvent.chatId, chatId))
    .orderBy(asc(chatEvent.eventIndex));

  return toActiveChat(
    row,
    events.map((eventRow) => eventRow.event),
  );
}

export async function markChatPendingMessage({
  chatId,
  message,
  userId,
}: {
  readonly chatId: string;
  readonly message: string;
  readonly userId: string;
}): Promise<ChatListItem> {
  const pendingMessage = message.trim();

  if (!pendingMessage) {
    throw new Error("Message cannot be empty.");
  }

  const [row] = await db
    .update(chat)
    .set({
      pendingUserMessage: pendingMessage,
      pendingUserMessageCreatedAt: new Date(),
      title: sql<string>`
        case
          when ${chat.title} = ${DEFAULT_CHAT_TITLE}
          then ${createFallbackTitle(pendingMessage)}
          else ${chat.title}
        end
      `,
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    throw new Error("Chat not found.");
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function appendChatEvents({
  chatId,
  events,
  userId,
}: {
  readonly chatId: string;
  readonly events: readonly IndexedChatEvent[];
  readonly userId: string;
}): Promise<void> {
  const rows = toChatEventRows(events);

  if (rows.length === 0) {
    return;
  }

  const [ownedChat] = await db
    .select({ id: chat.id })
    .from(chat)
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .limit(1);

  if (!ownedChat) {
    return;
  }

  // No conflict target: this absorbs both the (chat, event index) and the
  // (chat, eve event id) unique indexes, so replayed events are ignored.
  await db
    .insert(chatEvent)
    .values(
      rows.map((row) => ({
        chatId,
        event: row.event,
        eveEventId: row.eveEventId,
        eventIndex: row.index,
        id: randomUUID(),
      })),
    )
    .onConflictDoNothing();
}

export async function saveChatSession({
  chatId,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly session: ClientSessionState;
  readonly userId: string;
}): Promise<void> {
  await db
    .update(chat)
    .set({
      eveSession: session,
      pendingUserMessage: null,
      pendingUserMessageCreatedAt: null,
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}

export async function finalizeChatTurn({
  chatId,
  session,
  userId,
}: {
  readonly chatId: string;
  readonly session: ClientSessionState | null;
  readonly userId: string;
}): Promise<ChatListItem | null> {
  const [row] = await db
    .update(chat)
    .set({
      ...(session ? { eveSession: session } : {}),
      updatedAt: new Date(),
    })
    .where(and(eq(chat.id, chatId), eq(chat.userId, userId)))
    .returning({
      id: chat.id,
      title: chat.title,
      updatedAt: chat.updatedAt,
    });

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function deleteChatForUser(chatId: string, userId: string) {
  await db.delete(chat).where(and(eq(chat.id, chatId), eq(chat.userId, userId)));
}
