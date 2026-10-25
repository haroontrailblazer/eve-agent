import { describe, expect, it } from "vitest";
import { canApply, stateAfter, toDisplayStatus } from "@/lib/drafts/state";

describe("canApply", () => {
  it.each([
    ["approve", "pending_review", true], ["approve", "approved", false], ["approve", "skipped", false],
    ["skip", "pending_review", true], ["skip", "approved", true], ["skip", "published", false],
    ["restore", "skipped", true], ["restore", "pending_review", false],
    ["edit", "pending_review", true], ["edit", "approved", true], ["edit", "publishing", false], ["edit", "skipped", false],
  ] as const)("%s from %s is %s", (action, state, expected) => expect(canApply(action, state)).toBe(expected));
});

describe("stateAfter", () => {
  it("maps each action to its target state", () => {
    expect([stateAfter("approve"), stateAfter("skip"), stateAfter("restore"), stateAfter("edit")])
      .toEqual(["approved", "skipped", "pending_review", "pending_review"]);
  });
});

describe("toDisplayStatus", () => {
  it.each([
    ["pending_review", "needs_review"], ["approved", "approved"], ["scheduled", "scheduled"], ["publishing", "scheduled"],
    ["published", "posted"], ["failed", "failed"], ["skipped", "skipped"],
  ] as const)("%s shows as %s", (state, display) => expect(toDisplayStatus(state)).toBe(display));
});
