import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { skill, type Skill } from "@/lib/db/schema";

// Per-user custom skills. Built-in skills live in code (lib/skills/catalog.ts);
// these are the ones a user installs from chat and can delete. One row per
// (user, slug); the agent's install/delete tools, the composer slash menu, and
// the profile page all read/write here.

export async function listSkills(userId: string): Promise<Skill[]> {
  return db.select().from(skill).where(eq(skill.userId, userId)).orderBy(skill.name);
}

export async function getSkill(userId: string, slug: string): Promise<Skill | null> {
  const rows = await db
    .select()
    .from(skill)
    .where(and(eq(skill.userId, userId), eq(skill.slug, slug.toLowerCase())))
    .limit(1);

  return rows[0] ?? null;
}

export type UpsertSkillInput = {
  readonly userId: string;
  readonly slug: string;
  readonly name: string;
  readonly description?: string;
  readonly prompt?: string;
  readonly enabled?: boolean;
};

// Install or update a skill: insert a new row, or update the existing one for
// this (user, slug). Only provided fields are overwritten.
export async function upsertSkill(input: UpsertSkillInput): Promise<Skill> {
  const slugValue = input.slug.toLowerCase();
  const existing = await getSkill(input.userId, slugValue);
  const now = new Date();

  if (existing) {
    const rows = await db
      .update(skill)
      .set({
        name: input.name,
        description: input.description === undefined ? existing.description : input.description,
        prompt: input.prompt === undefined ? existing.prompt : input.prompt,
        enabled: input.enabled === undefined ? existing.enabled : input.enabled,
        updatedAt: now,
      })
      .where(eq(skill.id, existing.id))
      .returning();

    return rows[0]!;
  }

  const rows = await db
    .insert(skill)
    .values({
      id: randomUUID(),
      userId: input.userId,
      slug: slugValue,
      name: input.name,
      description: input.description ?? "",
      prompt: input.prompt ?? "",
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return rows[0]!;
}

export async function deleteSkill(userId: string, slug: string): Promise<boolean> {
  const rows = await db
    .delete(skill)
    .where(and(eq(skill.userId, userId), eq(skill.slug, slug.toLowerCase())))
    .returning({ id: skill.id });

  return rows.length > 0;
}
