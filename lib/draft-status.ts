// The lifecycle states of a draft and how each one is shown: a label, the
// custom property in app/globals.css that colors its glyph, and which glyph to
// draw. Functional color appears only on the glyph, never as a fill.

export type DraftStatus =
  | "draft"
  | "needs_review"
  | "scheduled"
  | "posted"
  | "failed"
  | "approved"
  | "skipped";

export type StatusGlyph = "dashed" | "half" | "clock" | "check" | "alert" | "dot" | "slash";

export const DRAFT_STATUS_META: Readonly<
  Record<
    DraftStatus,
    {
      readonly label: string;
      readonly colorToken: `--status-${string}`;
      readonly glyph: StatusGlyph;
    }
  >
> = {
  draft: { label: "Draft", colorToken: "--status-draft", glyph: "dashed" },
  needs_review: { label: "Needs review", colorToken: "--status-review", glyph: "half" },
  scheduled: { label: "Scheduled", colorToken: "--status-scheduled", glyph: "clock" },
  posted: { label: "Posted", colorToken: "--status-posted", glyph: "check" },
  failed: { label: "Failed", colorToken: "--status-failed", glyph: "alert" },
  approved: { label: "Approved", colorToken: "--status-scheduled", glyph: "dot" },
  skipped: { label: "Skipped", colorToken: "--status-draft", glyph: "slash" },
};
