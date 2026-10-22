import type { MessageStreamEvent } from "eve/client";

export type IndexedChatEvent = {
  readonly index: number;
  readonly event: MessageStreamEvent;
};

export type ChatEventRow = {
  readonly index: number;
  readonly eveEventId: string | null;
  readonly event: MessageStreamEvent;
};

/**
 * Maps indexed stream events to rows keyed by eve's `meta.id`. When an id
 * repeats, the first occurrence wins. Events without an id (streams from before
 * eve stamped one) are kept with a null `eveEventId`.
 */
export function toChatEventRows(events: readonly IndexedChatEvent[]): ChatEventRow[] {
  const seen = new Set<string>();
  const rows: ChatEventRow[] = [];

  for (const { index, event } of events) {
    const eveEventId = event.meta?.id ?? null;

    if (eveEventId !== null) {
      if (seen.has(eveEventId)) {
        continue;
      }

      seen.add(eveEventId);
    }

    rows.push({ index, eveEventId, event });
  }

  return rows;
}
