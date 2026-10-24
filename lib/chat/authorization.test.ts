import type { EveAuthorizationPart, EveMessage } from "eve/react";
import { describe, expect, it } from "vitest";
import {
  authorizationKey,
  getAuthorizationDisabledReason,
  getPendingAuthorizations,
} from "./authorization";

const required: EveAuthorizationPart = {
  attemptId: "a1",
  description: "d",
  displayName: "Notion",
  name: "notion",
  state: "required",
  stepIndex: 0,
  turnId: "t1",
  type: "authorization",
};

const completed: EveAuthorizationPart = {
  attemptId: "a1",
  description: "d",
  displayName: "Notion",
  name: "notion",
  outcome: "authorized",
  state: "completed",
  stepIndex: 0,
  turnId: "t1",
  type: "authorization",
};

function messageWith(...parts: EveMessage["parts"]): EveMessage {
  return { id: "m1", parts, role: "assistant" };
}

describe("getPendingAuthorizations", () => {
  it("returns required authorization parts", () => {
    expect(getPendingAuthorizations([messageWith(required)])).toEqual([required]);
  });

  it("skips completed authorization parts", () => {
    expect(getPendingAuthorizations([messageWith(completed)])).toHaveLength(0);
  });

  it("ignores other part types and collects across messages", () => {
    const second: EveAuthorizationPart = { ...required, attemptId: "a2", name: "linear" };

    expect(
      getPendingAuthorizations([
        messageWith({ text: "hello", type: "text" }, required),
        messageWith(second),
      ]),
    ).toEqual([required, second]);
  });
});

describe("getAuthorizationDisabledReason", () => {
  it("names the first pending connection", () => {
    expect(getAuthorizationDisabledReason([required])).toBe(
      "Connect Notion to continue this turn, or skip it.",
    );
  });

  it("returns undefined without pending authorizations", () => {
    expect(getAuthorizationDisabledReason([])).toBeUndefined();
  });
});

describe("authorizationKey", () => {
  it("prefers the attempt id", () => {
    expect(authorizationKey(required)).toBe("a1");
  });

  it("falls back to turn, step and name", () => {
    const { attemptId: _attemptId, ...withoutAttempt } = required;

    expect(authorizationKey(withoutAttempt as EveAuthorizationPart)).toBe("t1:0:notion");
  });
});
