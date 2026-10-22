import type { MessageStreamEvent } from "eve/client";
import { defaultMessageReducer, type EveMessage } from "eve/react";

/**
 * Folds a legacy chat's saved events into messages for read-only display.
 * Events saved by an older eve may no longer reduce cleanly, so a reducer
 * failure returns null instead of throwing.
 */
export function reduceLegacyEvents(
  events: readonly MessageStreamEvent[],
): readonly EveMessage[] | null {
  try {
    const reducer = defaultMessageReducer();
    let data = reducer.initial();

    for (const event of events) {
      data = reducer.reduce(data, event);
    }

    return data.messages;
  } catch {
    return null;
  }
}
