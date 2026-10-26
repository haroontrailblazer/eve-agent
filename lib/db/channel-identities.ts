import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db/client";

// Linked chat identities (WhatsApp, Slack) over the channel_identity table.
// A row says "this external sender is this harpy user, acting on this brand".

export type ChannelIdentityKind = "whatsapp" | "slack";

export type LinkedIdentity = {
  readonly id: string;
  readonly userId: string;
  readonly brandId: string;
  readonly channel: ChannelIdentityKind;
  readonly externalId: string;
  readonly phone: string | null;
  readonly bsuid: string | null;
  readonly email: string;
  readonly name: string | null;
  readonly linkedAt: string;
};

function toIdentity(row: Record<string, unknown>): LinkedIdentity {
  const linkedAt = row.linked_at instanceof Date ? row.linked_at : new Date(String(row.linked_at));
  return {
    id: String(row.id),
    userId: String(row.user_id),
    brandId: String(row.brand_id),
    channel: row.channel as ChannelIdentityKind,
    externalId: String(row.external_id),
    phone: row.phone === null ? null : String(row.phone),
    bsuid: row.bsuid === null ? null : String(row.bsuid),
    email: String(row.email),
    name: row.name === null ? null : String(row.name),
    linkedAt: linkedAt.toISOString(),
  };
}

const IDENTITY_COLUMNS = sql`ci."id", ci."user_id", ci."brand_id", ci."channel", ci."external_id", ci."phone", ci."bsuid", ci."linked_at", u."email", u."name"`;

export async function findLinkedIdentity(
  channel: ChannelIdentityKind,
  externalId: string,
): Promise<LinkedIdentity | null> {
  const result = await db.execute(sql`
select ${IDENTITY_COLUMNS} from "channel_identity" ci join "user" u on u."id" = ci."user_id"
where ci."channel" = ${channel} and ci."external_id" = ${externalId} limit 1`);
  const row = result.rows[0];
  return row ? toIdentity(row) : null;
}

// Re-linking an external id that is already linked moves it to the new user and
// brand, so a sender is only ever linked to one account.
export async function linkIdentity(input: {
  readonly channel: ChannelIdentityKind;
  readonly externalId: string;
  readonly userId: string;
  readonly brandId: string;
  readonly phone?: string | null;
  readonly bsuid?: string | null;
}): Promise<void> {
  await db.execute(sql`
insert into "channel_identity" ("id", "user_id", "brand_id", "channel", "external_id", "phone", "bsuid")
values (${randomUUID()}, ${input.userId}, ${input.brandId}, ${input.channel}, ${input.externalId}, ${input.phone ?? null}, ${input.bsuid ?? null})
on conflict ("channel", "external_id") do update
set "user_id" = excluded."user_id", "brand_id" = excluded."brand_id", "phone" = excluded."phone", "bsuid" = excluded."bsuid", "linked_at" = now()`);
}

export async function listIdentitiesForBrand(brandId: string): Promise<LinkedIdentity[]> {
  const result = await db.execute(sql`
select ${IDENTITY_COLUMNS} from "channel_identity" ci join "user" u on u."id" = ci."user_id"
where ci."brand_id" = ${brandId} order by ci."linked_at" desc`);
  return result.rows.map(toIdentity);
}

export async function unlinkIdentity(brandId: string, id: string): Promise<boolean> {
  const result = await db.execute(sql`
delete from "channel_identity" where "id" = ${id} and "brand_id" = ${brandId} returning "id"`);
  return result.rows.length > 0;
}

export async function findWhatsAppRecipient(brandId: string, userId: string): Promise<string | null> {
  const result = await db.execute(sql`
select "external_id" from "channel_identity"
where "channel" = 'whatsapp' and "brand_id" = ${brandId} and "user_id" = ${userId}
order by "linked_at" desc limit 1`);
  const row = result.rows[0];
  return row ? String(row.external_id) : null;
}
