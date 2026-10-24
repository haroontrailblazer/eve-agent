import { StatusGlyph } from "@/components/harpy/status-glyph";
import { DRAFT_STATUS_META, type DraftStatus } from "@/lib/draft-status";

// The surface stays neutral; only the glyph carries the status color.
export function StatusChip({ status }: { readonly status: DraftStatus }) {
  return (
    <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-muted px-2 text-meta font-medium text-foreground">
      <StatusGlyph status={status} />
      {DRAFT_STATUS_META[status].label}
    </span>
  );
}
