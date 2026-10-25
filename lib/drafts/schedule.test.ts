import { describe, expect, it } from "vitest";
import { normalizeProposedTime, PROPOSED_TIME_MAX_DAYS } from "@/lib/drafts/schedule";

const now = new Date("2026-10-24T10:00:00Z");
const DAY = 86_400_000;

describe("normalizeProposedTime", () => {
  it("accepts a time 2 days out and returns it as ISO", () => {
    expect(normalizeProposedTime("2026-10-26T15:30:00+05:30", now)).toEqual({ ok: true, iso: "2026-10-26T10:00:00.000Z" });
  });

  it("rejects a time 3 minutes out", () => {
    expect(normalizeProposedTime(new Date(now.getTime() + 3 * 60_000).toISOString(), now)).toEqual({
      ok: false,
      message: "Pick a time in the future.",
    });
  });

  it("accepts exactly 5 minutes out", () => {
    expect(normalizeProposedTime(new Date(now.getTime() + 5 * 60_000).toISOString(), now).ok).toBe(true);
  });

  it("rejects a time 61 days out and accepts the 60 day edge", () => {
    expect(PROPOSED_TIME_MAX_DAYS).toBe(60);
    expect(normalizeProposedTime(new Date(now.getTime() + 61 * DAY).toISOString(), now)).toEqual({
      ok: false,
      message: "Pick a time within 60 days.",
    });
    expect(normalizeProposedTime(new Date(now.getTime() + 60 * DAY).toISOString(), now).ok).toBe(true);
  });

  it("rejects text it can't read", () => {
    expect(normalizeProposedTime("next Tuesday", now)).toEqual({ ok: false, message: "I couldn't read that time." });
    expect(normalizeProposedTime("", now)).toEqual({ ok: false, message: "I couldn't read that time." });
  });
});
