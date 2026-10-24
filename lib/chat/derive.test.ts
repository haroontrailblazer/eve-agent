import type { ConversationInput, ConversationState, EveAuthorizationPart } from "eve/react";
import { describe, expect, it } from "vitest";
import { deriveChatView } from "./derive";

const base: ConversationState = {
  activeTurnId: undefined,
  agents: {},
  inputs: {},
  messages: [],
  tasks: {},
  turns: {},
};

const openInput = {
  request: { kind: "question", prompt: "Allow?", requestId: "r1" },
  status: "open",
  stepIndex: 0,
  turnId: "t1",
} as unknown as ConversationInput;

const requiredAuthorization: EveAuthorizationPart = {
  attemptId: "a1",
  description: "d",
  displayName: "Notion",
  name: "notion",
  state: "required",
  stepIndex: 0,
  turnId: "t1",
  type: "authorization",
};

describe("deriveChatView", () => {
  it("is busy while streaming with nothing to answer", () => {
    const view = deriveChatView({ conversation: base, status: "streaming" });

    expect(view.isBusy).toBe(true);
    expect(view.isWaitingOnUser).toBe(false);
    expect(view.isResuming).toBe(false);
    expect(view.pendingAuthorizations).toHaveLength(0);
    expect(view.openInputIds.size).toBe(0);
  });

  it("is busy while submitted", () => {
    expect(deriveChatView({ conversation: base, status: "submitted" }).isBusy).toBe(true);
  });

  it("waits on the user while an input is open", () => {
    const view = deriveChatView({
      conversation: { ...base, inputs: { r1: openInput } },
      status: "streaming",
    });

    expect(view.isBusy).toBe(false);
    expect(view.isWaitingOnUser).toBe(true);
    expect(view.openInputIds.has("r1")).toBe(true);
  });

  it("does not count a responded input as open", () => {
    const view = deriveChatView({
      conversation: { ...base, inputs: { r1: { ...openInput, status: "responded" } } },
      status: "streaming",
    });

    expect(view.isBusy).toBe(true);
    expect(view.openInputIds.size).toBe(0);
  });

  it("waits on the user while an authorization is required", () => {
    const view = deriveChatView({
      conversation: {
        ...base,
        messages: [{ id: "m1", parts: [requiredAuthorization], role: "assistant" }],
      },
      status: "streaming",
    });

    expect(view.isBusy).toBe(false);
    expect(view.isWaitingOnUser).toBe(true);
    expect(view.pendingAuthorizations).toEqual([requiredAuthorization]);
  });

  it("reports resuming without being busy", () => {
    const view = deriveChatView({ conversation: base, status: "resuming" });

    expect(view.isResuming).toBe(true);
    expect(view.isBusy).toBe(false);
  });

  it("is idle when ready", () => {
    const view = deriveChatView({ conversation: base, status: "ready" });

    expect(view.isBusy).toBe(false);
    expect(view.isResuming).toBe(false);
    expect(view.isWaitingOnUser).toBe(false);
  });
});
