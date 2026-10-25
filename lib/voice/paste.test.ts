import { describe, expect, it } from "vitest";
import { splitPastedExamples } from "@/lib/voice/paste";

describe("splitPastedExamples", () => {
  const long = (s: string) => `${s} ${"x".repeat(30)}`;
  it("splits on --- lines", () => expect(splitPastedExamples(`${long("one")}\n---\n${long("two")}`)).toHaveLength(2));
  it("falls back to blank lines", () => expect(splitPastedExamples(`${long("one")}\n\n\n${long("two")}`)).toHaveLength(2));
  it("drops tiny pieces", () => expect(splitPastedExamples("hi\n---\n" + long("ok"))).toHaveLength(1));
  it("caps at 50", () => expect(splitPastedExamples(Array.from({ length: 60 }, (_, i) => long(`p${i}`)).join("\n---\n"))).toHaveLength(50));
});
