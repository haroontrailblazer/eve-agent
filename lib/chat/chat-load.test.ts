import { describe, expect, it } from "vitest";
import {
  INITIAL_CHAT_LOAD,
  reduceChatLoad,
  type ChatLoadEvent,
  type ChatLoadState,
} from "@/lib/chat/chat-load";
import type { ActiveChat } from "@/lib/chat/types";

const chat = (overrides: Partial<ActiveChat> = {}): ActiveChat => ({
  events: [],
  id: "chat_1",
  legacy: false,
  nextEventIndex: 0,
  pendingUserMessage: null,
  session: undefined,
  title: "A chat",
  ...overrides,
});

// The fresh copy from the no-store /api/chats/:id fetch: the session and its
// saved events.
const saved = chat({
  events: [{ data: { turnId: "t1" }, type: "turn.started" }] as unknown as ActiveChat["events"],
  nextEventIndex: 1,
  session: { sessionId: "s1", streamIndex: 1 },
});

const failed: ChatLoadEvent = { message: "Failed to load chat history.", type: "fetch-failed" };

const run = (...events: readonly ChatLoadEvent[]): ChatLoadState =>
  events.reduce((state, event) => reduceChatLoad("chat_1", state, event), INITIAL_CHAT_LOAD);

describe("reduceChatLoad", () => {
  it("starts loading, with nothing to settle on", () => {
    expect(INITIAL_CHAT_LOAD).toEqual({ status: "loading" });
    expect(run()).toEqual({ status: "loading" });
  });

  it("settles on the fetch, the only source of the chat", () => {
    expect(run({ chat: saved, type: "fetched" })).toEqual({ chat: saved, status: "loaded" });
  });

  it("settles once: a later fetch does not replace the loaded chat", () => {
    // A stale copy with no session or events, as the router cache serves on
    // back and forward. It must never replace the chat already built.
    const stale = chat({ pendingUserMessage: "hi" });
    const state = run({ chat: saved, type: "fetched" }, { chat: stale, type: "fetched" });

    expect(state).toEqual({ chat: saved, status: "loaded" });
  });

  it("fails without settling when the fetch fails", () => {
    expect(run(failed)).toEqual({ message: "Failed to load chat history.", status: "failed" });
  });

  it("settles when a retried fetch answers after a failure", () => {
    expect(run(failed, { chat: saved, type: "fetched" })).toEqual({
      chat: saved,
      status: "loaded",
    });
  });

  it("keeps the loaded chat when a later fetch fails", () => {
    expect(run({ chat: saved, type: "fetched" }, failed)).toEqual({
      chat: saved,
      status: "loaded",
    });
  });

  it("ignores a fetch answer for another chat", () => {
    expect(run({ chat: chat({ id: "chat_2" }), type: "fetched" })).toEqual({ status: "loading" });
  });
});
