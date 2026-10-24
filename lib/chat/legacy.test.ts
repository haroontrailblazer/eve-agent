import type { MessageStreamEvent } from "eve/client";
import { describe, expect, it } from "vitest";
import { reduceLegacyEvents } from "./legacy";

describe("reduceLegacyEvents", () => {
  it("returns no messages for an empty log", () => {
    expect(reduceLegacyEvents([])).toEqual([]);
  });

  it("returns null instead of throwing when an event cannot be reduced", () => {
    const malformed = [{ type: "message.appended" } as unknown as MessageStreamEvent];

    expect(() => reduceLegacyEvents(malformed)).not.toThrow();
    expect(reduceLegacyEvents(malformed)).toBeNull();
  });
});
