import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// The dialog overlays are portaled, so they never reach a server render. The
// check reads the source: each overlay takes its scrim from the --overlay token.
describe.each(["dialog", "sheet", "alert-dialog"])("components/ui/%s.tsx", (name) => {
  const source = readFileSync(join(process.cwd(), "components", "ui", `${name}.tsx`), "utf8");

  it("dims the page with the overlay token", () => {
    expect(source).toContain("bg-overlay");
  });

  it("does not hard-code a black scrim", () => {
    expect(source).not.toContain("bg-black/50");
  });
});
