import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import { toActiveChat, type ChatRowForView } from "@/lib/chat/active-chat";

const S: ClientSessionState = { sessionId: "s1", streamIndex: 4 };

const row = (overrides: Partial<ChatRowForView>): ChatRowForView => ({
  eveSession: S,
  id: "chat_1",
  legacy: false,
  pendingUserMessage: "hi",
  title: "A chat",
  ...overrides,
});

const events = [
  { type: "turn.started", data: { turnId: "t1" } },
] as unknown as readonly MessageStreamEvent[];

describe("toActiveChat", () => {
  it("hides the session and pending message for a legacy chat", () => {
    const chat = toActiveChat(row({ legacy: true }), events);

    expect(chat.legacy).toBe(true);
    expect(chat.session).toBeUndefined();
    expect(chat.pendingUserMessage).toBeNull();
  });

  it("exposes the session and drops the pending message once a session exists", () => {
    const chat = toActiveChat(row({}), events);

    expect(chat.legacy).toBe(false);
    expect(chat.session).toBe(S);
    expect(chat.pendingUserMessage).toBeNull();
  });

  it("keeps the pending message while no session has started", () => {
    const chat = toActiveChat(row({ eveSession: null }), events);

    expect(chat.session).toBeUndefined();
    expect(chat.pendingUserMessage).toBe("hi");
  });

  it("passes id, title and events through unchanged", () => {
    const chat = toActiveChat(row({}), events);

    expect(chat.id).toBe("chat_1");
    expect(chat.title).toBe("A chat");
    expect(chat.events).toBe(events);
  });
});
