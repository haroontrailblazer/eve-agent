// Validation for a time the agent proposes for a draft. Pure, so it can run
// anywhere; the caller passes the clock.

export const PROPOSED_TIME_MAX_DAYS = 60;
const MIN_LEAD_MS = 5 * 60_000;
const DAY_MS = 86_400_000;

export function normalizeProposedTime(
  value: string,
  now: Date,
): { readonly ok: true; readonly iso: string } | { readonly ok: false; readonly message: string } {
  const trimmed = value.trim();
  const time = trimmed === "" ? Number.NaN : Date.parse(trimmed);
  if (Number.isNaN(time)) return { ok: false, message: "I couldn't read that time." };
  if (time < now.getTime() + MIN_LEAD_MS) return { ok: false, message: "Pick a time in the future." };
  if (time > now.getTime() + PROPOSED_TIME_MAX_DAYS * DAY_MS) {
    return { ok: false, message: `Pick a time within ${PROPOSED_TIME_MAX_DAYS} days.` };
  }
  return { ok: true, iso: new Date(time).toISOString() };
}
