import { toast } from "sonner";

/**
 * Shows a failed request as an error toast. The message is also the toast id,
 * so the same error shown twice updates one toast instead of stacking.
 */
export function showRequestError(message: string) {
  toast.error("Request failed", { description: message, id: message });
}
