import type { WorkflowStepToolContext } from "eve/tools";
import { exemplarsFor, loadBriefContext } from "@/lib/drafts/brief-context";
import { ideaSourceChannel, resolveTargets, type DraftPostsInput } from "@/lib/drafts/input";
import { DRAFT_RUNS_PER_HOUR, REVISIONS_PER_HOUR } from "@/lib/drafts/limits";
import { containsLink } from "@/lib/drafts/lint";
import type { DraftingDeps, DraftingPlan, RevisionPlan, SavePieceResult } from "@/lib/drafts/orchestrate";
import type { ContentPieceRecord, DraftRecord, IdeaRecord } from "@/lib/drafts/records";
import {
  clearIdeaRequested,
  createIdea,
  getDraft,
  getIdea,
  IdeaNotFoundError,
  listDraftsForIdea,
  listPiecesForIdea,
  saveContentPiece,
  saveGeneratedDraft,
  setDraftMedia,
  setPieceMedia,
  type SaveGeneratedDraftInput,
} from "@/lib/drafts/store";
import { canApply } from "@/lib/drafts/state";
import type { DraftTarget } from "@/lib/drafts/types";
import type { DraftSource } from "@/lib/drafts/writer";
import { errorMessage } from "@/lib/mcp-client";
import { getMediaAsset } from "@/lib/media/assets";
import { isAllowedImageType } from "@/lib/media/limits";
import { resolveBrandContext } from "@/lib/mcp-context";
import { generateBrandImage } from "@/lib/media/generate";
import { clearRevisionRequest, completeRevision, type ReviewResult } from "@/lib/review";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";

// The I/O half of drafting. Every export is a "use step" function the
// draft_posts workflow body awaits, so clocks, the database, Redis and the
// image model never run in the replayed body.
//
// The workflow bundle keeps this module's non-step code, so I/O belongs
// inside the step bodies: a module-level helper that calls the database
// would pull node:crypto into the bundle and fail the build.

const HOUR_SECONDS = 3_600;

type Failure = { readonly ok: false; readonly message: string };

function authAttributes(ctx: WorkflowStepToolContext): Record<string, unknown> | undefined {
  const auth = (ctx as { session?: { auth?: { current?: unknown; initiator?: unknown } } }).session?.auth;
  const current = (auth?.current ?? auth?.initiator) as { attributes?: Record<string, unknown> } | undefined;
  return current?.attributes;
}

function existingFor(
  target: DraftTarget,
  drafts: readonly DraftRecord[],
  pieces: readonly ContentPieceRecord[],
): DraftingPlan["targets"][number]["existing"] {
  if (target.kind === "post") {
    const found = drafts.find((draft) => draft.platform === target.platform);
    return found ? { draftId: found.id, revision: found.revision } : null;
  }
  const found = pieces.find((piece) => piece.kind === target.piece);
  return found ? { pieceId: found.id } : null;
}

export async function prepareDrafting(
  ctx: WorkflowStepToolContext,
  input: DraftPostsInput,
): Promise<{ readonly ok: true; readonly plan: DraftingPlan; readonly brandId: string; readonly userId: string } | Failure> {
  "use step";

  const brandContext = await resolveBrandContext(ctx);
  if (!brandContext) return { ok: false, message: "You need to be signed in to draft posts." };
  const { brandId, userId } = brandContext;

  const ideaId = input.ideaId?.trim() ?? "";
  const ideaText = input.idea?.trim() ?? "";
  if ((ideaId === "") === (ideaText === "")) return { ok: false, message: "Give me an idea to draft." };

  const ownerMediaId = input.imageMediaId ?? null;
  if (ownerMediaId !== null) {
    const photo = await getMediaAsset(ownerMediaId);
    if (!photo || photo.brandId !== brandId || !isAllowedImageType(photo.mediaType)) {
      return { ok: false, message: "That photo is gone. Send it again." };
    }
  }

  try {
    await enforceRateLimit({ key: brandId, limit: DRAFT_RUNS_PER_HOUR, prefix: "draft:run", windowSeconds: HOUR_SECONDS });
  } catch (error) {
    // A refused run for a saved idea ends its request, so Studio offers Try
    // again at once. Best effort: the refusal is what gets reported.
    if (ideaId !== "") {
      try {
        await clearIdeaRequested(brandId, ideaId);
      } catch {
        // The refusal matters more than the clear.
      }
    }
    if (error instanceof RateLimitError) {
      return { ok: false, message: `Drafting limit reached (${DRAFT_RUNS_PER_HOUR} an hour). Try again later.` };
    }
    return { ok: false, message: `Couldn't check the drafting limit: ${errorMessage(error)}` };
  }

  const sources: DraftSource[] = (input.sources ?? []).map((source) => ({
    url: source.url?.trim() || null,
    title: source.title?.trim() || null,
    text: source.text,
  }));

  let saved: IdeaRecord | null = null;
  if (ideaId !== "") {
    saved = await getIdea(brandId, ideaId);
    if (!saved) return { ok: false, message: "That idea is gone." };
  }

  const [context, drafts, pieces] = await Promise.all([
    loadBriefContext(brandId),
    saved ? listDraftsForIdea(brandId, saved.id) : [],
    saved ? listPiecesForIdea(brandId, saved.id) : [],
  ]);
  const targets = resolveTargets(input, saved?.requested ?? null);

  // The idea is written last: a failed read retries this whole step, and must
  // not leave a second copy of the idea behind.
  const firstUrl = sources.find((source) => source.url !== null)?.url ?? null;
  const idea =
    saved ??
    (await createIdea({
      brandId,
      userId,
      text: ideaText,
      sourceKind: input.sourceKind ?? (firstUrl ? "link" : "text"),
      sourceChannel: ideaSourceChannel(authAttributes(ctx)),
      sourceRef: firstUrl ?? ownerMediaId,
      requested: {
        platforms: targets.flatMap((target) => (target.kind === "post" ? [target.platform] : [])),
        pieces: targets.flatMap((target) => (target.kind === "piece" ? [target.piece] : [])),
      },
    }));

  return {
    ok: true,
    brandId,
    userId,
    plan: {
      ideaId: idea.id,
      now: context.now,
      timezone: context.timezone,
      voiceGuide: context.voiceGuide,
      preferences: context.preferences,
      idea: idea.text,
      sources,
      allowLinksOnX: input.allowLinksOnX ?? false,
      redraft: input.redraft ?? false,
      ownerMediaId,
      targets: targets.map((target) => ({
        target,
        exemplars: exemplarsFor(context.examples, target, idea.text),
        existing: existingFor(target, drafts, pieces),
      })),
    },
  };
}

export async function saveDraftStep(input: SaveGeneratedDraftInput): ReturnType<typeof saveGeneratedDraft> {
  "use step";
  return saveGeneratedDraft(input);
}

// Expected misses come back as results: a thrown error would be retried.
// Anything else still throws, so the workflow retries it.
export async function savePieceStep(input: Parameters<typeof saveContentPiece>[0]): Promise<SavePieceResult> {
  "use step";
  try {
    return { ok: true, ...(await saveContentPiece(input)) };
  } catch (error) {
    if (error instanceof IdeaNotFoundError) return { ok: false, reason: "idea_gone" };
    throw error;
  }
}

export async function generateImageStep(input: {
  readonly brandId: string;
  readonly userId: string;
  readonly prompt: string;
}): ReturnType<DraftingDeps["generateImage"]> {
  "use step";
  return generateBrandImage(input);
}

export async function attachDraftImageStep(input: {
  readonly brandId: string;
  readonly draftId: string;
  readonly revision: number;
  readonly mediaId: string;
}): Promise<boolean> {
  "use step";
  // False when the draft's revision moved on before the image landed.
  return setDraftMedia({
    brandId: input.brandId,
    draftId: input.draftId,
    revision: input.revision,
    mediaIds: [input.mediaId],
  });
}

// Ends the idea's drafting request after a run with failed targets. A thrown
// error is retried; runDrafting treats a final failure as best effort.
export async function clearIdeaRequestStep(input: { readonly brandId: string; readonly ideaId: string }): Promise<void> {
  "use step";
  await clearIdeaRequested(input.brandId, input.ideaId);
}

export async function attachPieceImageStep(input: {
  readonly brandId: string;
  readonly pieceId: string;
  readonly mediaId: string;
}): Promise<boolean> {
  "use step";
  // False when the piece is gone.
  return setPieceMedia({ brandId: input.brandId, pieceId: input.pieceId, mediaIds: [input.mediaId] });
}

export async function prepareRevision(
  ctx: WorkflowStepToolContext,
  input: {
    readonly draftId: string;
    readonly instruction: string;
    readonly regenerateImage?: boolean;
    readonly allowLinksOnX?: boolean;
  },
): Promise<{ readonly ok: true; readonly plan: RevisionPlan; readonly brandId: string; readonly userId: string } | Failure> {
  "use step";

  const brandContext = await resolveBrandContext(ctx);
  if (!brandContext) return { ok: false, message: "You need to be signed in to revise drafts." };
  const { brandId, userId } = brandContext;

  // A refused revision clears the draft's request, so its card stops showing
  // it as being refined. Best effort: the refusal is what gets reported.
  const refuse = async (message: string): Promise<Failure> => {
    try {
      await clearRevisionRequest(brandId, input.draftId);
    } catch {
      // The refusal matters more than the clear.
    }
    return { ok: false, message };
  };

  try {
    await enforceRateLimit({ key: brandId, limit: REVISIONS_PER_HOUR, prefix: "draft:revise", windowSeconds: HOUR_SECONDS });
  } catch (error) {
    if (error instanceof RateLimitError) {
      return refuse(`Revision limit reached (${REVISIONS_PER_HOUR} an hour). Try again later.`);
    }
    return refuse(`Couldn't check the revision limit: ${errorMessage(error)}`);
  }

  const draft = await getDraft(brandId, input.draftId);
  if (!draft) return refuse("That draft is gone.");
  if (!canApply("edit", draft.status)) return refuse("That draft can't be changed now.");

  // A revision has no stored sources. If the idea is gone, the draft's own
  // text stands in for it.
  const idea = await getIdea(brandId, draft.ideaId);
  const ideaText = idea?.text ?? draft.text;
  const target: DraftTarget = { kind: "post", platform: draft.platform };
  const context = await loadBriefContext(brandId);

  return {
    ok: true,
    brandId,
    userId,
    plan: {
      draftId: draft.id,
      revision: draft.revision,
      brief: {
        target,
        now: context.now,
        timezone: context.timezone,
        voiceGuide: context.voiceGuide,
        preferences: context.preferences,
        exemplars: exemplarsFor(context.examples, target, ideaText),
        idea: ideaText,
        sources: [],
        // Allowed when the owner asks for a link, and a link the owner
        // already accepted on X is not repaired away.
        allowLinksOnX: input.allowLinksOnX === true || (draft.platform === "x" && containsLink(draft.text)),
      },
      currentPosts: draft.posts,
      instruction: input.instruction,
      regenerateImage: input.regenerateImage ?? false,
      existingImagePrompt: draft.imagePrompt,
    },
  };
}

export async function completeRevisionStep(input: Parameters<typeof completeRevision>[0]): Promise<ReviewResult> {
  "use step";
  return completeRevision(input);
}

export async function abandonRevisionStep(input: { readonly brandId: string; readonly draftId: string }): Promise<void> {
  "use step";
  await clearRevisionRequest(input.brandId, input.draftId);
}
