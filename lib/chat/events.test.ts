import type { MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import { hasOpenTurn } from "@/lib/chat/events";

const ev = (type: string, data: unknown, id?: string) =>
  ({
    type,
    data,
    ...(id ? { meta: { id, at: "2026-10-22T00:00:00.000Z" } } : {}),
  }) as unknown as MessageStreamEvent;

const started = (turnId: string) => ev("turn.started", { turnId });
const completed = (turnId: string) => ev("turn.completed", { turnId });

describe("hasOpenTurn", () => {
  it("is false for no events", () => expect(hasOpenTurn([])).toBe(false));

  it("is true after turn.started", () => expect(hasOpenTurn([started("t1")])).toBe(true));

  it("stays true while the turn waits for input", () =>
    expect(hasOpenTurn([started("t1"), ev("turn.waiting", { turnId: "t1", on: "input" })])).toBe(
      true,
    ));

  it("is false after turn.completed", () =>
    expect(hasOpenTurn([started("t1"), completed("t1")])).toBe(false));

  it("is false after turn.cancelled and session.waiting", () =>
    expect(
      hasOpenTurn([started("t1"), ev("turn.cancelled", { turnId: "t1" }), ev("session.waiting", {})]),
    ).toBe(false));

  it("is false after turn.failed", () =>
    expect(hasOpenTurn([started("t1"), ev("turn.failed", { turnId: "t1" })])).toBe(false));

  it("is true when a second turn starts after the first completed", () =>
    expect(hasOpenTurn([started("t1"), completed("t1"), started("t2")])).toBe(true));
});
