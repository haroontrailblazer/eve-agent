"use server";

import { z } from "zod";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import { SOCIAL_PLATFORM_KEYS, type SocialPlatform } from "@/lib/drafts/types";
import { getServerViewer } from "@/lib/session";
import { buildRewriteGuideRequest } from "@/lib/studio/requests";
import { splitPastedExamples } from "@/lib/voice/paste";
import {
  VOICE_GUIDE_MAX_CHARS,
  VOICE_PREFERENCE_MAX_CHARS,
  addVoiceExamples,
  addVoicePreference,
  deleteVoiceExample,
  deleteVoicePreference,
  getActiveVoiceGuide,
  listVoiceExamples,
  restoreVoiceGuideVersion,
  saveVoiceGuideVersion,
} from "@/lib/voice/store";
import { REWRITE_MIN_EXAMPLES } from "@/lib/voice/view";

type Failure = { readonly ok: false; readonly message: string };

const SIGN_IN_MESSAGE = "Sign in with Vercel to continue.";
const STALE_MESSAGE = "Your guide changed somewhere else. Reload to see it.";
const RAW_MAX_CHARS = 250_000;

const guideInput = z.object({
  body: z
    .string()
    .trim()
    .min(1, "The guide cannot be empty.")
    .max(VOICE_GUIDE_MAX_CHARS, `Keep the guide under ${VOICE_GUIDE_MAX_CHARS} characters.`),
  basedOnVersion: z.number().int().min(1),
});
const versionInput = z.object({ version: z.number().int().min(1) });
const examplesInput = z.object({
  platform: z.enum(SOCIAL_PLATFORM_KEYS).nullable(),
  raw: z.string().max(RAW_MAX_CHARS, "That paste is too long."),
});
const idInput = z.object({ id: z.string().min(1).max(100) });
const preferenceInput = z.object({
  text: z
    .string()
    .trim()
    .min(1, "Write the preference first.")
    .max(VOICE_PREFERENCE_MAX_CHARS, `Keep it under ${VOICE_PREFERENCE_MAX_CHARS} characters.`),
});

function invalid(error: z.ZodError): Failure {
  return { ok: false, message: error.issues[0]?.message ?? "That request is not valid." };
}

// The signed-in viewer and their brand, or the message to show instead.
async function context() {
  const viewer = await getServerViewer();

  if (!viewer) {
    return { ok: false, message: SIGN_IN_MESSAGE } as const;
  }

  try {
    return { ok: true, viewer, brandId: await getBrandIdForUser(viewer) } as const;
  } catch (error) {
    if (error instanceof BrandAccessError) {
      return { ok: false, message: error.message } as const;
    }

    throw error;
  }
}

export async function saveVoiceGuideAction(input: {
  body: string;
  basedOnVersion: number;
}): Promise<{ ok: true } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = guideInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const saved = await saveVoiceGuideVersion({
    brandId: ctx.brandId,
    body: parsed.data.body,
    source: "manual",
    userId: ctx.viewer.id,
    basedOnVersion: parsed.data.basedOnVersion,
  });

  return saved.ok ? { ok: true } : { ok: false, message: STALE_MESSAGE };
}

export async function restoreVoiceGuideAction(input: { version: number }): Promise<{ ok: true } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = versionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const restored = await restoreVoiceGuideVersion({
    brandId: ctx.brandId,
    version: parsed.data.version,
    userId: ctx.viewer.id,
  });

  if (restored.ok) return { ok: true };

  return {
    ok: false,
    message: restored.reason === "not_found" ? "That version is gone." : STALE_MESSAGE,
  };
}

export async function addVoiceExamplesAction(input: {
  platform: SocialPlatform | null;
  raw: string;
}): Promise<{ ok: true; added: number } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = examplesInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const added = await addVoiceExamples({
    brandId: ctx.brandId,
    platform: parsed.data.platform,
    texts: splitPastedExamples(parsed.data.raw),
  });

  if (added.length === 0) {
    return { ok: false, message: "Paste at least one post of 20 characters or more." };
  }

  return { ok: true, added: added.length };
}

export async function deleteVoiceExampleAction(input: { id: string }): Promise<{ ok: boolean }> {
  const ctx = await context();
  if (!ctx.ok) return { ok: false };

  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false };

  return { ok: await deleteVoiceExample(ctx.brandId, parsed.data.id) };
}

export async function addVoicePreferenceAction(input: { text: string }): Promise<{ ok: true } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = preferenceInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  await addVoicePreference({ brandId: ctx.brandId, text: parsed.data.text, source: "owner" });
  return { ok: true };
}

export async function deleteVoicePreferenceAction(input: { id: string }): Promise<{ ok: boolean }> {
  const ctx = await context();
  if (!ctx.ok) return { ok: false };

  const parsed = idInput.safeParse(input);
  if (!parsed.success) return { ok: false };

  return { ok: await deleteVoicePreference(ctx.brandId, parsed.data.id) };
}

export async function requestGuideRewriteAction(): Promise<{ ok: true; message: string } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const examples = await listVoiceExamples(ctx.brandId, REWRITE_MIN_EXAMPLES);

  if (examples.length < REWRITE_MIN_EXAMPLES) {
    return { ok: false, message: "Add at least 3 example posts first." };
  }

  // Seeds version 1 if the guide has never been read.
  await getActiveVoiceGuide(ctx.brandId);

  return { ok: true, message: buildRewriteGuideRequest() };
}
