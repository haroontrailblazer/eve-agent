import { DRAFT_STATUS_META, type DraftStatus } from "@/lib/draft-status";
import { cn } from "@/lib/utils";

// Tailwind classes that color a status glyph from its token.
export const STATUS_TEXT_CLASS: Readonly<Record<DraftStatus, string>> = {
  draft: "text-status-draft",
  needs_review: "text-status-review",
  scheduled: "text-status-scheduled",
  posted: "text-status-posted",
  failed: "text-status-failed",
};

// A 12px glyph drawn in currentColor, so the color comes from the status token.
export function StatusGlyph({
  className,
  status,
}: {
  readonly className?: string;
  readonly status: DraftStatus;
}) {
  const glyph = DRAFT_STATUS_META[status].glyph;

  return (
    <svg
      aria-hidden="true"
      className={cn("size-3 shrink-0", STATUS_TEXT_CLASS[status], className)}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 12 12"
    >
      <circle cx="6" cy="6" r="4.5" strokeDasharray={glyph === "dashed" ? "2 2" : undefined} />
      {glyph === "half" && <path d="M6 1.5a4.5 4.5 0 0 1 0 9z" fill="currentColor" stroke="none" />}
      {glyph === "clock" && <path d="M6 3.5V6l1.75 1" />}
      {glyph === "check" && <path d="m4 6.1 1.5 1.5L8 4.6" />}
      {glyph === "alert" && <path d="M6 3.6v2.9M6 8.4v.01" />}
    </svg>
  );
}
