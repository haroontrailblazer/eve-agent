// The seven message templates harpy sends outside the 24-hour window. The
// wording here is the copy the owner submits to Meta; change it only together
// with a resubmission.

import { recipientFields, type WhatsAppOutbound } from "@/lib/whatsapp/cloud-api";

export const TEMPLATE_LANGUAGE = "en";

export type TemplateName =
  | "harpy_morning_brief"
  | "harpy_drafts_ready"
  | "harpy_post_published"
  | "harpy_post_failed"
  | "harpy_new_activity"
  | "harpy_weekly_report"
  | "harpy_reconnect_needed";

export type TemplateSpec = {
  readonly name: TemplateName;
  readonly category: "UTILITY";
  readonly body: string;
  readonly example: readonly string[];
  readonly buttons: readonly string[];
};

export const TEMPLATES: Readonly<Record<TemplateName, TemplateSpec>> = {
  harpy_morning_brief: {
    name: "harpy_morning_brief",
    category: "UTILITY",
    body: "Your content brief for {{1}} is ready: {{2}} trends and {{3}} post ideas.",
    example: ["Thu 22 Oct", "3", "5"],
    buttons: ["Show brief", "Not today"],
  },
  harpy_drafts_ready: {
    name: "harpy_drafts_ready",
    category: "UTILITY",
    body: "You have {{1}} new drafts to review: {{2}}",
    example: ["3", "Small teams ship faster"],
    buttons: ["Review"],
  },
  harpy_post_published: {
    name: "harpy_post_published",
    category: "UTILITY",
    body: "Your {{1}} post is live.",
    example: ["LinkedIn"],
    buttons: ["View post"],
  },
  harpy_post_failed: {
    name: "harpy_post_failed",
    category: "UTILITY",
    body: "Your {{1}} post could not be published: {{2}}",
    example: ["X", "the image was too large"],
    buttons: ["Retry", "Open"],
  },
  harpy_new_activity: {
    name: "harpy_new_activity",
    category: "UTILITY",
    body: "{{1}} new replies and mentions. {{2}} may need a response.",
    example: ["4", "2"],
    buttons: ["Review now", "Later"],
  },
  harpy_weekly_report: {
    name: "harpy_weekly_report",
    category: "UTILITY",
    body: "Your weekly summary for {{1}} is ready.",
    example: ["19 to 25 Oct"],
    buttons: ["Show summary"],
  },
  harpy_reconnect_needed: {
    name: "harpy_reconnect_needed",
    category: "UTILITY",
    body: "Your {{1}} connection needs you to sign in again by {{2}}.",
    example: ["LinkedIn", "Mon 14 Dec"],
    buttons: ["Open Channels"],
  },
};

// Template parameters cannot hold newlines, tabs or runs of spaces.
export function templateParam(text: string, max: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length <= max ? flat : `${flat.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function templateMessage(input: {
  readonly waId: string;
  readonly name: TemplateName;
  readonly params: readonly string[];
  readonly payloads: readonly string[];
}): WhatsAppOutbound {
  const { waId, name, params, payloads } = input;

  return {
    ...recipientFields(waId),
    type: "template",
    template: {
      name,
      language: { code: TEMPLATE_LANGUAGE },
      components: [
        { type: "body", parameters: params.map((text) => ({ type: "text", text })) },
        ...payloads.map((payload, index) => ({
          type: "button",
          sub_type: "quick_reply",
          index: String(index),
          parameters: [{ type: "payload", payload }],
        })),
      ],
    },
  };
}
