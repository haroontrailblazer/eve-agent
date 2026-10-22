import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("keeps a text size and a text color together", () => {
    expect(cn("text-body", "text-muted-foreground")).toBe("text-body text-muted-foreground");
  });

  it("lets a named text size replace a stock text size", () => {
    expect(cn("text-sm", "text-body")).toBe("text-body");
  });

  it("lets the raised shadow replace a stock shadow", () => {
    expect(cn("shadow-sm", "shadow-raised")).toBe("shadow-raised");
  });
});
