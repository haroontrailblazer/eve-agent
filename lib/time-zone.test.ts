import { describe, expect, it } from "vitest";
import { isValidTimeZone } from "@/lib/time-zone";

describe("isValidTimeZone", () => {
  it("accepts an IANA zone", () => expect(isValidTimeZone("Asia/Kolkata")).toBe(true));
  it("rejects an unknown zone", () => expect(isValidTimeZone("Mars/Base")).toBe(false));
  it("rejects an empty string", () => expect(isValidTimeZone("")).toBe(false));
});
