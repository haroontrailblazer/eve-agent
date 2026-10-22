import type { MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import { toChatEventRows } from "@/lib/chat/event-rows";

const ev = (type: string, data: unknown, id?: string) =>
  ({
    type,
    data,
    ...(id ? { meta: { id, at: "2026-10-22T00:00:00.000Z" } } : {}),
  }) as unknown as MessageStreamEvent;

describe("toChatEventRows", () => {
  it("maps an indexed event to a row keyed by its meta.id", () => {
    const event = ev("turn.started", { turnId: "t1" }, "evt_a");

    expect(toChatEventRows([{ index: 4, event }])).toEqual([
      { index: 4, eveEventId: "evt_a", event },
    ]);
  });

  it("keeps only the first event when a meta.id repeats", () => {
    const first = ev("turn.started", { turnId: "t1" }, "evt_a");
    const second = ev("turn.started", { turnId: "t1" }, "evt_a");
    const rows = toChatEventRows([
      { index: 1, event: first },
      { index: 2, event: second },
    ]);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.index).toBe(1);
    expect(rows[0]?.event).toBe(first);
  });

  it("keeps an event without meta and gives it a null eveEventId", () => {
    const event = ev("session.waiting", {});

    expect(toChatEventRows([{ index: 0, event }])).toEqual([
      { index: 0, eveEventId: null, event },
    ]);
  });

  it("does not collapse several events that all lack meta", () => {
    const rows = toChatEventRows([
      { index: 0, event: ev("session.waiting", {}) },
      { index: 1, event: ev("session.waiting", {}) },
    ]);

    expect(rows.map((row) => row.index)).toEqual([0, 1]);
  });

  it("follows the input order", () => {
    const rows = toChatEventRows([
      { index: 9, event: ev("turn.started", { turnId: "t1" }, "evt_c") },
      { index: 3, event: ev("turn.completed", { turnId: "t1" }, "evt_a") },
      { index: 5, event: ev("session.waiting", {}, "evt_b") },
    ]);

    expect(rows.map((row) => row.eveEventId)).toEqual(["evt_c", "evt_a", "evt_b"]);
  });

  it("returns an empty list for no events", () => {
    expect(toChatEventRows([])).toEqual([]);
  });
});
