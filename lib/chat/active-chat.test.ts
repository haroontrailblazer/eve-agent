import type { ClientSessionState, MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import { toActiveChat, type ChatRowForView } from "@/lib/chat/active-chat";
import type { IndexedChatEvent } from "@/lib/chat/event-rows";

const S: ClientSessionState = { sessionId: "s1", streamIndex: 4 };

const row = (overrides: Partial<ChatRowForView>): ChatRowForView => ({
  eveSession: S,
  id: "chat_1",
  legacy: false,
  pendingUserMessage: "hi",
  title: "A chat",
  ...overrides,
});

const started = { type: "turn.started", data: { turnId: "t1" } } as unknown as MessageStreamEvent;
const completed = {
  type: "turn.completed",
  data: { turnId: "t1" },
} as unknown as MessageStreamEvent;

const events: readonly IndexedChatEvent[] = [{ event: started, index: 0 }];

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

  it("passes id and title through and keeps the events in order", () => {
    const chat = toActiveChat(row({}), [
      { event: started, index: 0 },
      { event: completed, index: 1 },
    ]);

    expect(chat.id).toBe("chat_1");
    expect(chat.title).toBe("A chat");
    expect(chat.events).toEqual([started, completed]);
  });

  it("starts the next event index at 0 when no events are saved", () => {
    expect(toActiveChat(row({ eveSession: null }), []).nextEventIndex).toBe(0);
  });

  it("continues the next event index after the highest saved index", () => {
    expect(toActiveChat(row({}), events).nextEventIndex).toBe(1);
  });

  it("continues past a gap in the saved log rather than reusing an index", () => {
    const chat = toActiveChat(row({}), [
      { event: started, index: 0 },
      { event: completed, index: 5 },
    ]);

    // Two events are saved, but index 2 could already be taken; the next new
    // event must not collide with index 5.
    expect(chat.events).toHaveLength(2);
    expect(chat.nextEventIndex).toBe(6);
  });
});
