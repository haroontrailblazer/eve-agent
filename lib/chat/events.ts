import type { MessageStreamEvent } from "eve/client";

/**
 * True while a turn has started and not yet completed, failed or been
 * cancelled. A turn parked on `turn.waiting` is still open.
 */
export function hasOpenTurn(events: readonly MessageStreamEvent[]): boolean {
  const openTurnIds = new Set<string>();

  for (const event of events) {
    switch (event.type) {
      case "turn.started":
        openTurnIds.add(event.data.turnId);
        break;
      case "turn.completed":
      case "turn.failed":
      case "turn.cancelled":
        openTurnIds.delete(event.data.turnId);
        break;
      default:
        break;
    }
  }

  return openTurnIds.size > 0;
}
