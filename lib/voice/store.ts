import { randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { DEFAULT_VOICE_GUIDE } from "@/lib/content-guides/voice-default";
import { db } from "@/lib/db/client";
import {
  voiceExample,
  voiceGuide,
  voicePreference,
  type VoiceExampleRow,
  type VoiceGuideRow,
  type VoicePreferenceRow,
} from "@/lib/db/schema";
import type { SocialPlatform } from "@/lib/drafts/types";

// The owner's voice: a versioned guide, example posts and short preferences.
// Every query filters on brand_id.

export type VoiceGuideSource = "default" | "manual" | "harpy" | "restore";

export type VoiceGuide = {
  readonly id: string;
  readonly brandId: string;
  readonly version: number;
  readonly body: string;
  readonly source: VoiceGuideSource;
  readonly note: string;
  readonly createdAt: string;
};

export type VoiceExample = {
  readonly id: string;
  readonly brandId: string;
  readonly platform: SocialPlatform | null;
  readonly text: string;
  readonly source: "pasted" | "published";
  readonly createdAt: string;
};

export type VoicePreference = {
  readonly id: string;
  readonly brandId: string;
  readonly text: string;
  readonly source: "owner" | "chat";
  readonly createdAt: string;
};

export const VOICE_GUIDE_MAX_CHARS = 12_000;
export const VOICE_EXAMPLE_MIN_CHARS = 20;
export const VOICE_EXAMPLE_MAX_CHARS = 5_000;
export const VOICE_PREFERENCE_MAX_CHARS = 300;

const MAX_EXAMPLES_PER_BATCH = 50;

function toGuide(row: VoiceGuideRow): VoiceGuide {
  return {
    id: row.id,
    brandId: row.brandId,
    version: row.version,
    body: row.body,
    source: row.source,
    note: row.note,
    createdAt: row.createdAt.toISOString(),
  };
}

function toExample(row: VoiceExampleRow): VoiceExample {
  return {
    id: row.id,
    brandId: row.brandId,
    platform: row.platform,
    text: row.text,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPreference(row: VoicePreferenceRow): VoicePreference {
  return {
    id: row.id,
    brandId: row.brandId,
    text: row.text,
    source: row.source,
    createdAt: row.createdAt.toISOString(),
  };
}

async function selectLatestGuide(brandId: string): Promise<VoiceGuideRow | undefined> {
  const rows = await db
    .select()
    .from(voiceGuide)
    .where(eq(voiceGuide.brandId, brandId))
    .orderBy(desc(voiceGuide.version))
    .limit(1);

  return rows[0];
}

// Seeds version 1 from the default guide on first use. Concurrent first calls
// race on (brand_id, version); the loser's insert is a no-op.
export async function getActiveVoiceGuide(brandId: string): Promise<VoiceGuide> {
  const existing = await selectLatestGuide(brandId);

  if (existing) {
    return toGuide(existing);
  }

  await db
    .insert(voiceGuide)
    .values({
      id: randomUUID(),
      brandId,
      version: 1,
      body: DEFAULT_VOICE_GUIDE,
      source: "default",
      note: "",
      createdByUserId: null,
    })
    .onConflictDoNothing({ target: [voiceGuide.brandId, voiceGuide.version] });

  const seeded = await selectLatestGuide(brandId);

  if (!seeded) {
    throw new Error(`Could not create or find the voice guide for brand ${brandId}.`);
  }

  return toGuide(seeded);
}

export async function listVoiceGuideVersions(brandId: string, limit = 10): Promise<VoiceGuide[]> {
  const rows = await db
    .select()
    .from(voiceGuide)
    .where(eq(voiceGuide.brandId, brandId))
    .orderBy(desc(voiceGuide.version))
    .limit(limit);

  return rows.map(toGuide);
}

type SaveResult =
  | { readonly ok: true; readonly guide: VoiceGuide }
  | { readonly ok: false; readonly reason: "stale"; readonly latest: VoiceGuide };

// Optimistic concurrency: the insert only lands when nobody else has written
// version basedOnVersion + 1 first.
export async function saveVoiceGuideVersion(input: {
  readonly brandId: string;
  readonly body: string;
  readonly source: Exclude<VoiceGuideSource, "default">;
  readonly note?: string;
  readonly userId: string | null;
  readonly basedOnVersion: number;
}): Promise<SaveResult> {
  const body = input.body.trim();

  if (body === "") {
    throw new Error("The voice guide cannot be empty.");
  }

  if (body.length > VOICE_GUIDE_MAX_CHARS) {
    throw new Error(`The voice guide is longer than ${VOICE_GUIDE_MAX_CHARS} characters.`);
  }

  const inserted = await db
    .insert(voiceGuide)
    .values({
      id: randomUUID(),
      brandId: input.brandId,
      version: input.basedOnVersion + 1,
      body,
      source: input.source,
      note: input.note ?? "",
      createdByUserId: input.userId,
    })
    .onConflictDoNothing({ target: [voiceGuide.brandId, voiceGuide.version] })
    .returning();

  const row = inserted[0];

  if (row) {
    return { ok: true, guide: toGuide(row) };
  }

  return { ok: false, reason: "stale", latest: await getActiveVoiceGuide(input.brandId) };
}

export async function restoreVoiceGuideVersion(input: {
  readonly brandId: string;
  readonly version: number;
  readonly userId: string;
}): Promise<
  | { readonly ok: true; readonly guide: VoiceGuide }
  | { readonly ok: false; readonly reason: "not_found" | "stale" }
> {
  const rows = await db
    .select()
    .from(voiceGuide)
    .where(and(eq(voiceGuide.brandId, input.brandId), eq(voiceGuide.version, input.version)))
    .limit(1);
  const chosen = rows[0];

  if (!chosen) {
    return { ok: false, reason: "not_found" };
  }

  const latest = await getActiveVoiceGuide(input.brandId);
  const saved = await saveVoiceGuideVersion({
    brandId: input.brandId,
    body: chosen.body,
    source: "restore",
    note: `Restored version ${input.version}`,
    userId: input.userId,
    basedOnVersion: latest.version,
  });

  return saved.ok ? saved : { ok: false, reason: "stale" };
}

export async function addVoiceExamples(input: {
  readonly brandId: string;
  readonly platform: SocialPlatform | null;
  readonly texts: readonly string[];
}): Promise<VoiceExample[]> {
  const texts = input.texts
    .map((text) => text.trim())
    .filter((text) => text.length >= VOICE_EXAMPLE_MIN_CHARS && text.length <= VOICE_EXAMPLE_MAX_CHARS)
    .slice(0, MAX_EXAMPLES_PER_BATCH);

  if (texts.length === 0) {
    return [];
  }

  const rows = await db
    .insert(voiceExample)
    .values(
      texts.map((text) => ({
        id: randomUUID(),
        brandId: input.brandId,
        platform: input.platform,
        text,
        source: "pasted" as const,
      })),
    )
    .returning();

  return rows.map(toExample);
}

export async function listVoiceExamples(brandId: string, limit = 100): Promise<VoiceExample[]> {
  const rows = await db
    .select()
    .from(voiceExample)
    .where(eq(voiceExample.brandId, brandId))
    .orderBy(desc(voiceExample.createdAt))
    .limit(limit);

  return rows.map(toExample);
}

export async function deleteVoiceExample(brandId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(voiceExample)
    .where(and(eq(voiceExample.id, id), eq(voiceExample.brandId, brandId)))
    .returning({ id: voiceExample.id });

  return rows.length > 0;
}

export async function addVoicePreference(input: {
  readonly brandId: string;
  readonly text: string;
  readonly source: "owner" | "chat";
}): Promise<VoicePreference> {
  const text = input.text.trim();

  if (text === "" || text.length > VOICE_PREFERENCE_MAX_CHARS) {
    throw new Error(`A voice preference must be 1 to ${VOICE_PREFERENCE_MAX_CHARS} characters.`);
  }

  const rows = await db
    .insert(voicePreference)
    .values({ id: randomUUID(), brandId: input.brandId, text, source: input.source })
    .returning();
  const row = rows[0];

  if (!row) {
    throw new Error("Could not save the voice preference.");
  }

  return toPreference(row);
}

export async function listVoicePreferences(brandId: string, limit = 50): Promise<VoicePreference[]> {
  const rows = await db
    .select()
    .from(voicePreference)
    .where(eq(voicePreference.brandId, brandId))
    .orderBy(desc(voicePreference.createdAt))
    .limit(limit);

  return rows.map(toPreference);
}

export async function deleteVoicePreference(brandId: string, id: string): Promise<boolean> {
  const rows = await db
    .delete(voicePreference)
    .where(and(eq(voicePreference.id, id), eq(voicePreference.brandId, brandId)))
    .returning({ id: voicePreference.id });

  return rows.length > 0;
}
