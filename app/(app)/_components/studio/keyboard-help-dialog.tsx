import { Fragment } from "react";
import { KbdHint } from "@/components/harpy/kbd-hint";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// Each row lists its keys; keys in separate groups are alternatives (J or K).
const SHORTCUTS: readonly { readonly keys: readonly (readonly string[])[]; readonly label: string }[] = [
  { keys: [["J"], ["K"]], label: "Move between drafts" },
  { keys: [["A"]], label: "Approve" },
  { keys: [["E"]], label: "Edit" },
  { keys: [["S"]], label: "Skip" },
  { keys: [["?"]], label: "Show shortcuts" },
];

export function KeyboardHelpDialog({
  onOpenChange,
  open,
}: {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent aria-describedby={undefined} className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-heading">Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <dl className="flex flex-col gap-3">
          {SHORTCUTS.map((shortcut) => (
            <div className="flex items-center justify-between gap-4" key={shortcut.label}>
              <dt className="text-small text-foreground">{shortcut.label}</dt>
              <dd className="flex items-center gap-1 text-meta text-muted-foreground">
                {shortcut.keys.map((group, index) => (
                  <Fragment key={group.join("+")}>
                    {index > 0 ? <span>/</span> : null}
                    <KbdHint keys={group} />
                  </Fragment>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </DialogContent>
    </Dialog>
  );
}
