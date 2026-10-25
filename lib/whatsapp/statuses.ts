import { createHmac, timingSafeEqual } from "node:crypto";
import {
  claimTemplateFallback,
  findNotificationByProviderMessageId,
  findWaMessage,
  markNotificationFailed,
  markNotificationSent,
} from "@/lib/notify/store";
import { WINDOW_CLOSED_CODE } from "@/lib/whatsapp/cloud-api";
import { sendDraftsReadyTemplate } from "@/lib/whatsapp/deliver";

// Delivery statuses arrive on the same webhook as messages, but the Chat SDK
// adapter ignores them. The route wrapper reads them first, after checking the
// same X-Hub-Signature-256 HMAC the adapter checks.

export function verifyMetaSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header || !header.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", appSecret).update(rawBody).digest("hex"));
  const given = Buffer.from(header.slice("sha256=".length));
  return given.length === expected.length && timingSafeEqual(given, expected);
}

export type WhatsAppStatus = {
  readonly wamid: string;
  readonly status: "sent" | "delivered" | "read" | "failed";
  readonly recipient: string;
  readonly errorCode: number | null;
};

const STATUS_VALUES: ReadonlySet<string> = new Set(["sent", "delivered", "read", "failed"]);

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function extractStatuses(payload: unknown): WhatsAppStatus[] {
  const statuses: WhatsAppStatus[] = [];
  for (const entry of asArray(asRecord(payload)?.entry)) {
    for (const change of asArray(asRecord(entry)?.changes)) {
      const record = asRecord(change);
      if (record?.field !== "messages") continue;
      for (const raw of asArray(asRecord(record.value)?.statuses)) {
        const status = asRecord(raw);
        if (!status || typeof status.id !== "string" || typeof status.status !== "string") continue;
        if (!STATUS_VALUES.has(status.status)) continue;
        const code = asRecord(asArray(status.errors)[0])?.code;
        statuses.push({
          wamid: status.id,
          status: status.status as WhatsAppStatus["status"],
          recipient: typeof status.recipient_id === "string" ? status.recipient_id : "",
          errorCode: typeof code === "number" ? code : null,
        });
      }
    }
  }
  return statuses;
}

async function sendTemplateFallback(notificationId: string): Promise<void> {
  // Only the first status for a notification wins the claim; retries stop here.
  const notification = await claimTemplateFallback(notificationId);
  if (!notification) return;
  const template = await sendDraftsReadyTemplate(notification);
  if (!template.ok) {
    await markNotificationFailed({ id: notification.id, error: template.message });
    return;
  }
  await markNotificationSent({ id: notification.id, delivery: "template", providerMessageId: template.wamid });
}

export async function handleStatuses(statuses: readonly WhatsAppStatus[]): Promise<void> {
  for (const status of statuses) {
    if (status.status !== "failed") continue;
    try {
      const message = await findWaMessage(status.wamid);
      if (message) {
        if (message.notificationId && status.errorCode === WINDOW_CLOSED_CODE) {
          await sendTemplateFallback(message.notificationId);
          continue;
        }
      } else {
        const notification = await findNotificationByProviderMessageId(status.wamid);
        if (notification) {
          await markNotificationFailed({ id: notification.id, error: `WhatsApp error ${status.errorCode ?? "unknown"}` });
          continue;
        }
      }
      console.warn("WhatsApp message failed", { wamid: status.wamid, code: status.errorCode });
    } catch (error) {
      console.warn("WhatsApp status handling failed", { wamid: status.wamid, error });
    }
  }
}
