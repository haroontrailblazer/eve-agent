"use server";

import { z } from "zod";
import { BrandAccessError, getBrandIdForUser } from "@/lib/brand-access";
import { setBrandTimezone } from "@/lib/db/brands";
import { DRAFT_STATES, PIECE_KINDS, SOCIAL_PLATFORM_KEYS } from "@/lib/drafts/types";
import { editTextToPlatformPosts } from "@/lib/drafts/thread-text";
import { IDEA_MAX_CHARS, createIdea, getDraft, markIdeaRequested } from "@/lib/drafts/store";
import {
  approveDraft,
  requestRevision,
  restoreDraft,
  reviewFailureMessage,
  saveManualEdit,
  skipDraft,
  type ReviewResult,
} from "@/lib/review";
import { getServerViewer } from "@/lib/session";
import { isValidTimeZone } from "@/lib/time-zone";
import { buildDraftIdeaRequest, buildRevisionRequest, extractLinks } from "@/lib/studio/requests";
import { toStudioDraft } from "@/lib/studio/snapshot";
import type { StudioDraft } from "@/lib/studio/types";

export type StudioActionResult =
  | { readonly ok: true; readonly draft: StudioDraft }
  | { readonly ok: false; readonly message: string; readonly draft: StudioDraft | null };

type Failure = { readonly ok: false; readonly message: string };

const SIGN_IN_MESSAGE = "Sign in with Vercel to continue.";
const REVISION_MAX_CHARS = 2000;
const EDIT_MAX_CHARS = 20_000;

const ideaInput = z
  .object({
    text: z.string().trim().min(1, "Write the idea first.").max(IDEA_MAX_CHARS, `Keep the idea under ${IDEA_MAX_CHARS} characters.`),
    platforms: z.array(z.enum(SOCIAL_PLATFORM_KEYS)),
    pieces: z.array(z.enum(PIECE_KINDS)),
  })
  .refine((value) => value.platforms.length + value.pieces.length > 0, { message: "Pick at least one platform." });
const ideaIdInput = z.object({ ideaId: z.string().min(1).max(100) });
const draftIdInput = z.object({ draftId: z.string().min(1).max(100) });
const guardedInput = draftIdInput.extend({
  expectedRevision: z.number().int().min(1),
  expectedStatus: z.enum(DRAFT_STATES),
});
const editInput = draftIdInput.extend({
  expectedRevision: z.number().int().min(1),
  text: z.string().min(1, "Write something first.").max(EDIT_MAX_CHARS),
});
const revisionInput = draftIdInput.extend({
  expectedRevision: z.number().int().min(1),
  instruction: z.string().trim().min(1, "Say what to change.").max(REVISION_MAX_CHARS),
});
const timezoneInput = z.object({ timezone: z.string().min(1).max(100) });

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

async function toResult(brandId: string, result: ReviewResult): Promise<StudioActionResult> {
  if (result.ok) {
    return { ok: true, draft: await toStudioDraft(brandId, result.draft) };
  }

  return {
    ok: false,
    message: reviewFailureMessage(result.reason),
    draft: result.draft ? await toStudioDraft(brandId, result.draft) : null,
  };
}

export async function createIdeaAction(input: {
  text: string;
  platforms: ("x" | "linkedin" | "threads")[];
  pieces: ("reel_script" | "carousel_outline")[];
}): Promise<{ ok: true; ideaId: string; message: string } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = ideaInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const { text, platforms, pieces } = parsed.data;
  const created = await createIdea({
    brandId: ctx.brandId,
    userId: ctx.viewer.id,
    text,
    sourceKind: extractLinks(text).length > 0 ? "link" : "text",
    sourceChannel: "studio",
    requested: { platforms: [...new Set(platforms)], pieces: [...new Set(pieces)] },
  });

  return { ok: true, ideaId: created.id, message: buildDraftIdeaRequest({ ideaId: created.id, ideaText: text }) };
}

// draft_posts skips the targets that already exist, so a retry drafts only the missing ones.
export async function retryIdeaAction(input: {
  ideaId: string;
}): Promise<{ ok: true; message: string } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = ideaIdInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const marked = await markIdeaRequested(ctx.brandId, parsed.data.ideaId);
  if (!marked) return { ok: false, message: "That idea is gone." };

  return { ok: true, message: buildDraftIdeaRequest({ ideaId: marked.id, ideaText: marked.text }) };
}

export async function approveDraftAction(input: {
  draftId: string;
  expectedRevision: number;
  expectedStatus: (typeof DRAFT_STATES)[number];
}): Promise<StudioActionResult> {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, draft: null };

  const parsed = guardedInput.safeParse(input);
  if (!parsed.success) return { ...invalid(parsed.error), draft: null };

  const result = await approveDraft({
    brandId: ctx.brandId,
    draftId: parsed.data.draftId,
    expectedRevision: parsed.data.expectedRevision,
    expectedStatus: parsed.data.expectedStatus,
    via: "web",
  });
  return toResult(ctx.brandId, result);
}

export async function skipDraftAction(input: {
  draftId: string;
  expectedRevision: number;
  expectedStatus: (typeof DRAFT_STATES)[number];
}): Promise<StudioActionResult> {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, draft: null };

  const parsed = guardedInput.safeParse(input);
  if (!parsed.success) return { ...invalid(parsed.error), draft: null };

  const result = await skipDraft({
    brandId: ctx.brandId,
    draftId: parsed.data.draftId,
    expectedRevision: parsed.data.expectedRevision,
    expectedStatus: parsed.data.expectedStatus,
  });
  return toResult(ctx.brandId, result);
}

export async function restoreDraftAction(input: { draftId: string }): Promise<StudioActionResult> {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, draft: null };

  const parsed = draftIdInput.safeParse(input);
  if (!parsed.success) return { ...invalid(parsed.error), draft: null };

  return toResult(ctx.brandId, await restoreDraft({ brandId: ctx.brandId, draftId: parsed.data.draftId }));
}

export async function saveDraftEditAction(input: {
  draftId: string;
  expectedRevision: number;
  text: string;
}): Promise<StudioActionResult> {
  const ctx = await context();
  if (!ctx.ok) return { ...ctx, draft: null };

  const parsed = editInput.safeParse(input);
  if (!parsed.success) return { ...invalid(parsed.error), draft: null };

  // The platform decides whether a --- line splits the edit into thread parts.
  const current = await getDraft(ctx.brandId, parsed.data.draftId);
  if (!current) return { ok: false, message: reviewFailureMessage("not_found"), draft: null };

  const posts = editTextToPlatformPosts(current.platform, parsed.data.text);

  if (posts.length === 0) {
    return { ok: false, message: "Write something first.", draft: await toStudioDraft(ctx.brandId, current) };
  }

  const result = await saveManualEdit({
    brandId: ctx.brandId,
    draftId: parsed.data.draftId,
    expectedRevision: parsed.data.expectedRevision,
    posts,
    userId: ctx.viewer.id,
  });
  return toResult(ctx.brandId, result);
}

export async function requestDraftRevisionAction(input: {
  draftId: string;
  expectedRevision: number;
  instruction: string;
}): Promise<{ ok: true; message: string } | Failure> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = revisionInput.safeParse(input);
  if (!parsed.success) return invalid(parsed.error);

  const result = await requestRevision({
    brandId: ctx.brandId,
    draftId: parsed.data.draftId,
    expectedRevision: parsed.data.expectedRevision,
  });

  if (!result.ok) return { ok: false, message: reviewFailureMessage(result.reason) };

  return {
    ok: true,
    message: buildRevisionRequest({
      draftId: result.draft.id,
      platform: result.draft.platform,
      instruction: parsed.data.instruction,
    }),
  };
}

export async function setBrandTimezoneAction(input: { timezone: string }): Promise<{ ok: boolean; message?: string }> {
  const ctx = await context();
  if (!ctx.ok) return ctx;

  const parsed = timezoneInput.safeParse(input);
  if (!parsed.success || !isValidTimeZone(parsed.data.timezone)) {
    return { ok: false, message: "That time zone is not valid." };
  }

  await setBrandTimezone(ctx.brandId, parsed.data.timezone);
  return { ok: true };
}
