import { describe, expect, it } from "vitest";

import { TEMPLATES, templateMessage, templateParam } from "@/lib/whatsapp/templates";

describe("TEMPLATES", () => {
  it("has examples for every placeholder and short button labels", () => {
    for (const spec of Object.values(TEMPLATES)) {
      const placeholders = new Set(spec.body.match(/\{\{\d+\}\}/g) ?? []);
      expect(placeholders.size, spec.name).toBe(spec.example.length);
      expect(spec.category).toBe("UTILITY");
      for (const label of spec.buttons) expect(label.length, `${spec.name} ${label}`).toBeLessThanOrEqual(20);
    }
  });

  it("pins the submitted wording", () => {
    expect(TEMPLATES.harpy_morning_brief.body).toBe(
      "Your content brief for {{1}} is ready: {{2}} trends and {{3}} post ideas.",
    );
    expect(TEMPLATES.harpy_reconnect_needed.buttons).toEqual(["Open Channels"]);
    expect(Object.keys(TEMPLATES)).toHaveLength(7);
  });
});

describe("templateParam", () => {
  it("collapses whitespace and trims", () => {
    expect(templateParam("a\n\nb\tc     d", 100)).toBe("a b c d");
    expect(templateParam("  hi  ", 100)).toBe("hi");
  });

  it("cuts to the limit with an ellipsis", () => {
    const result = templateParam("x".repeat(70), 60);

    expect(result).toHaveLength(60);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("templateMessage", () => {
  it("builds body parameters and quick reply payloads", () => {
    expect(
      templateMessage({
        waId: "1555",
        name: "harpy_drafts_ready",
        params: ["3", "Idea"],
        payloads: ["harpy:review:i1"],
      }),
    ).toEqual({
      to: "1555",
      type: "template",
      template: {
        name: "harpy_drafts_ready",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "3" },
              { type: "text", text: "Idea" },
            ],
          },
          {
            type: "button",
            sub_type: "quick_reply",
            index: "0",
            parameters: [{ type: "payload", payload: "harpy:review:i1" }],
          },
        ],
      },
    });
  });
});
