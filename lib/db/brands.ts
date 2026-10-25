import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { brand, brandMember, user, type Brand } from "@/lib/db/schema";

// Brand and brand membership records. Which brand a user gets is decided in
// lib/brand-access-policy.ts; these helpers only read and write rows.

// Idempotent: concurrent first requests race on idx_brand_owner, the loser's
// insert is a no-op, and both read back the same row.
export async function ensureOwnerBrand(ownerUserId: string): Promise<Brand> {
  await db
    .insert(brand)
    .values({ id: randomUUID(), ownerUserId })
    .onConflictDoNothing({ target: brand.ownerUserId });

  const rows = await db.select().from(brand).where(eq(brand.ownerUserId, ownerUserId)).limit(1);
  const ownerBrand = rows[0];

  if (!ownerBrand) {
    throw new Error(`Could not create or find the brand for owner ${ownerUserId}.`);
  }

  await addBrandMember({ brandId: ownerBrand.id, userId: ownerUserId, role: "owner" });

  return ownerBrand;
}

export async function findBrandIdForMember(userId: string): Promise<string | null> {
  const rows = await db
    .select({ brandId: brandMember.brandId })
    .from(brandMember)
    .where(eq(brandMember.userId, userId))
    .orderBy(asc(brandMember.createdAt))
    .limit(1);

  return rows[0]?.brandId ?? null;
}

// Keeps an existing membership (and its role) when the user is already a member.
export async function addBrandMember(input: {
  readonly brandId: string;
  readonly userId: string;
  readonly role: "owner" | "member";
}): Promise<void> {
  await db
    .insert(brandMember)
    .values({ id: randomUUID(), brandId: input.brandId, userId: input.userId, role: input.role })
    .onConflictDoNothing({ target: [brandMember.brandId, brandMember.userId] });
}

export async function isBrandMember(brandId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: brandMember.id })
    .from(brandMember)
    .where(and(eq(brandMember.brandId, brandId), eq(brandMember.userId, userId)))
    .limit(1);

  return rows.length > 0;
}

export async function findUserIdByEmail(email: string): Promise<string | null> {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email.trim().toLowerCase()))
    .limit(1);

  return rows[0]?.id ?? null;
}

export async function getBrandSettings(
  brandId: string,
): Promise<{ readonly timezone: string; readonly name: string } | null> {
  const rows = await db
    .select({ timezone: brand.timezone, name: brand.name })
    .from(brand)
    .where(eq(brand.id, brandId))
    .limit(1);

  return rows[0] ?? null;
}

export async function setBrandTimezone(brandId: string, timezone: string): Promise<void> {
  await db.update(brand).set({ timezone, updatedAt: new Date() }).where(eq(brand.id, brandId));
}
