"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { showRequestError } from "@/components/harpy/show-request-error";

/**
 * A button that asks before it acts. It opens an alert dialog, and the confirm
 * button reads `pendingLabel` while `onConfirm` runs. The dialog stays open and
 * cannot be dismissed until `onConfirm` settles, then closes when it resolves.
 * If it rejects, the dialog stays open and the error shows as a toast.
 */
export function ConfirmActionButton({
  confirmBody,
  confirmLabel,
  confirmTitle,
  label,
  onConfirm,
  pendingLabel,
  variant = "destructive",
}: {
  readonly label: string;
  readonly confirmTitle: string;
  readonly confirmBody: string;
  readonly confirmLabel: string;
  readonly pendingLabel: string;
  readonly variant?: "destructive" | "outline";
  readonly onConfirm: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function confirm() {
    setPending(true);

    try {
      await onConfirm();
      setOpen(false);
    } catch (error) {
      showRequestError(error instanceof Error ? error.message : "Something went wrong.");
    } finally {
      setPending(false);
    }
  }

  return (
    <AlertDialog
      onOpenChange={(next) => {
        if (!pending) setOpen(next);
      }}
      open={open}
    >
      <AlertDialogTrigger asChild>
        <Button size="sm" type="button" variant={variant}>
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirmTitle}</AlertDialogTitle>
          <AlertDialogDescription>{confirmBody}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          {/* The action closes the dialog on click by default, so it is stopped
              here and the dialog closes itself once onConfirm resolves. */}
          <AlertDialogAction
            disabled={pending}
            onClick={(event) => {
              event.preventDefault();
              void confirm();
            }}
            variant={variant === "destructive" ? "destructive" : "default"}
          >
            {pending ? pendingLabel : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
