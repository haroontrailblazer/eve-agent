import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";
import type {
  NotificationDelivery,
  NotificationKind,
  NotificationPayload,
  NotificationRecord,
} from "@/lib/notify/types";

// The notification outbox and the WhatsApp message map. neon-http has no
// transactions, so every write is one statement: insert-once is
// `on conflict do nothing`, and claims are conditional updates.

function iso(value: unknown): string {
  return (value instanceof Date ? value : new Date(String(value))).toISOString();
}

function toNotification(row: Record<string, unknown>): NotificationRecord {
  return {
    id: String(row.id),
    brandId: String(row.brand_id),
    channel: "whatsapp",
    recipient: String(row.recipient),
    kind: row.kind as NotificationKind,
    dedupeKey: String(row.dedupe_key),
    payload: row.payload as NotificationPayload,
    status: row.status as NotificationRecord["status"],
    delivery: (row.delivery as NotificationDelivery | null) ?? null,
    providerMessageId: row.provider_message_id === null ? null : String(row.provider_message_id),
    attempts: Number(row.attempts),
    lastError: row.last_error === null ? null : String(row.last_error),
    createdAt: iso(row.created_at),
  };
}

export async function insertNotification(input: {
  readonly brandId: string;
  readonly recipient: string;
  readonly kind: NotificationKind;
  readonly dedupeKey: string;
  readonly payload: NotificationPayload;
}): Promise<{ readonly created: boolean; readonly notification: NotificationRecord }> {
  const inserted = await db.execute(sql`
insert into "notification" ("id", "brand_id", "channel", "recipient", "kind", "dedupe_key", "payload")
values (${randomUUID()}, ${input.brandId}, 'whatsapp', ${input.recipient}, ${input.kind}, ${input.dedupeKey}, ${JSON.stringify(input.payload)}::jsonb)
on conflict ("dedupe_key") do nothing
returning *`);
  const row = inserted.rows[0];
  if (row) return { created: true, notification: toNotification(row) };

  const existing = await db.execute(sql`select * from "notification" where "dedupe_key" = ${input.dedupeKey} limit 1`);
  const found = existing.rows[0];
  if (!found) throw new Error(`Notification ${input.dedupeKey} was neither inserted nor found.`);
  return { created: false, notification: toNotification(found) };
}

export async function markNotificationSent(input: {
  readonly id: string;
  readonly delivery: NotificationDelivery;
  readonly providerMessageId: string | null;
}): Promise<void> {
  await db.execute(sql`
update "notification" set "status" = 'sent', "delivery" = ${input.delivery}, "provider_message_id" = ${input.providerMessageId}, "attempts" = "attempts" + 1, "updated_at" = now()
where "id" = ${input.id}`);
}

export async function markNotificationFailed(input: { readonly id: string; readonly error: string }): Promise<void> {
  await db.execute(sql`
update "notification" set "status" = 'failed', "last_error" = ${input.error}, "attempts" = "attempts" + 1, "updated_at" = now()
where "id" = ${input.id}`);
}

// Only the caller that flips a sent service message to the template wins, so a
// retried status webhook can't send the template twice.
export async function claimTemplateFallback(id: string): Promise<NotificationRecord | null> {
  const result = await db.execute(sql`
update "notification" set "delivery" = 'template', "attempts" = "attempts" + 1, "updated_at" = now()
where "id" = ${id} and "status" = 'sent' and "delivery" = 'service'
returning *`);
  const row = result.rows[0];
  return row ? toNotification(row) : null;
}

export async function getNotification(id: string): Promise<NotificationRecord | null> {
  const result = await db.execute(sql`select * from "notification" where "id" = ${id} limit 1`);
  const row = result.rows[0];
  return row ? toNotification(row) : null;
}

export async function recordWaMessage(input: {
  readonly brandId: string;
  readonly wamid: string;
  readonly draftId: string;
  readonly revision: number;
  readonly kind: "card" | "full_text";
  readonly notificationId: string | null;
  readonly recipient: string;
}): Promise<void> {
  await db.execute(sql`
insert into "wa_message_map" ("id", "brand_id", "wamid", "draft_id", "revision", "kind", "notification_id", "recipient")
values (${randomUUID()}, ${input.brandId}, ${input.wamid}, ${input.draftId}, ${input.revision}, ${input.kind}, ${input.notificationId}, ${input.recipient})
on conflict ("wamid") do nothing`);
}

export async function findWaMessage(wamid: string): Promise<{
  readonly brandId: string;
  readonly draftId: string;
  readonly revision: number;
  readonly kind: "card" | "full_text";
  readonly notificationId: string | null;
} | null> {
  const result = await db.execute(sql`
select "brand_id", "draft_id", "revision", "kind", "notification_id" from "wa_message_map" where "wamid" = ${wamid} limit 1`);
  const row = result.rows[0];
  if (!row) return null;
  return {
    brandId: String(row.brand_id),
    draftId: String(row.draft_id),
    revision: Number(row.revision),
    kind: row.kind as "card" | "full_text",
    notificationId: row.notification_id === null ? null : String(row.notification_id),
  };
}
