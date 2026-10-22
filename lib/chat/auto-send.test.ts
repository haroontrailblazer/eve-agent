import { describe, expect, it } from "vitest";
import { shouldAutoSendPending } from "./auto-send";

type AutoSendChat = Parameters<typeof shouldAutoSendPending>[0];

const chat = (overrides: Partial<AutoSendChat>): AutoSendChat => ({
  legacy: false,
  pendingUserMessage: "hi",
  session: undefined,
  ...overrides,
});

describe("shouldAutoSendPending", () => {
  it("sends a pending message for a chat with no session yet", () => {
    expect(shouldAutoSendPending(chat({}), true)).toBe(true);
  });

  it("does not send again once a session exists", () => {
    expect(
      shouldAutoSendPending(chat({ session: { sessionId: "s", streamIndex: 3 } }), true),
    ).toBe(false);
  });

  it("never sends for a legacy chat", () => {
    expect(shouldAutoSendPending(chat({ legacy: true }), true)).toBe(false);
  });

  it("does not send a blank pending message", () => {
    expect(shouldAutoSendPending(chat({ pendingUserMessage: "  " }), true)).toBe(false);
  });

  it("does not send when there is no pending message", () => {
    expect(shouldAutoSendPending(chat({ pendingUserMessage: null }), true)).toBe(false);
  });

  it("does not send from server data alone, without the local handoff marker", () => {
    expect(shouldAutoSendPending(chat({}), false)).toBe(false);
  });
});
