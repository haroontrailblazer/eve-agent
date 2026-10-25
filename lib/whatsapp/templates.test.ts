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
    expect(Object.fromEntries(Object.values(TEMPLATES).map((spec) => [spec.name, spec.body]))).toEqual({
      harpy_morning_brief: "Your content brief for {{1}} is ready: {{2}} trends and {{3}} post ideas.",
      harpy_drafts_ready: 'Drafts ready to review: {{1}}, from your idea "{{2}}". Tap Review to see them.',
      harpy_post_published: "Your {{1}} post is live. Tap View post to open it.",
      harpy_post_failed: "Your {{1}} post could not be published: {{2}}. Tap Retry to try again.",
      harpy_new_activity: "New replies and mentions: {{1}}. {{2}} may need a response.",
      harpy_weekly_report: "Your weekly summary for {{1}} is ready. Tap Show summary to read it.",
      harpy_reconnect_needed:
        "Your {{1}} connection needs you to sign in again by {{2}}. Tap Open Channels to reconnect.",
    });
    expect(TEMPLATES.harpy_reconnect_needed.buttons).toEqual(["Open Channels"]);
    expect(Object.keys(TEMPLATES)).toHaveLength(7);
  });

  // Meta rejects a body that starts or ends with a variable (error 2388299).
  it("never starts or ends a body with a placeholder", () => {
    for (const spec of Object.values(TEMPLATES)) {
      const core = spec.body
        .trim()
        .replace(/^["'(\s]+/, "")
        .replace(/[.,;:!?"')\s]+$/, "");
      expect(core, spec.name).not.toMatch(/^\{\{\d+\}\}/);
      expect(core, spec.name).not.toMatch(/\{\{\d+\}\}$/);
    }
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
