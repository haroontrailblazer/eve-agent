import type { WorkflowStepToolContext } from "eve/tools";
import { getBrandSettings } from "@/lib/db/brands";
import { ideaSourceChannel, resolveTargets, type DraftPostsInput } from "@/lib/drafts/input";
import { DRAFT_RUNS_PER_HOUR } from "@/lib/drafts/limits";
import type { DraftingDeps, DraftingPlan } from "@/lib/drafts/orchestrate";
import type { ContentPieceRecord, DraftRecord, IdeaRecord } from "@/lib/drafts/records";
import {
  createIdea,
  getIdea,
  listDraftsForIdea,
  listPiecesForIdea,
  saveContentPiece,
  saveGeneratedDraft,
  setDraftMedia,
  setPieceMedia,
  type SaveGeneratedDraftInput,
} from "@/lib/drafts/store";
import type { DraftTarget } from "@/lib/drafts/types";
import type { DraftSource } from "@/lib/drafts/writer";
import { errorMessage } from "@/lib/mcp-client";
import { resolveBrandContext } from "@/lib/mcp-context";
import { generateBrandImage } from "@/lib/media/generate";
import { enforceRateLimit, RateLimitError } from "@/lib/rate-limit";
import { isValidTimeZone } from "@/lib/time-zone";
import { selectExemplars } from "@/lib/voice/exemplars";
import { getActiveVoiceGuide, listVoiceExamples, listVoicePreferences, type VoiceExample } from "@/lib/voice/store";

// The I/O half of drafting. Every export is a "use step" function the
// draft_posts workflow body awaits, so clocks, the database, Redis and the
// image model never run in the replayed body.
//
// The workflow bundle keeps this module's non-step code, so I/O belongs
// inside the step bodies: a module-level helper that calls the database
// would pull node:crypto into the bundle and fail the build.

const HOUR_SECONDS = 3_600;
const EXEMPLARS_PER_TARGET = 4;
const PREFERENCES_LIMIT = 30;
const EXAMPLES_LIMIT = 100;

type Failure = { readonly ok: false; readonly message: string };

function authAttributes(ctx: WorkflowStepToolContext): Record<string, unknown> | undefined {
  const auth = (ctx as { session?: { auth?: { current?: unknown; initiator?: unknown } } }).session?.auth;
  const current = (auth?.current ?? auth?.initiator) as { attributes?: Record<string, unknown> } | undefined;
  return current?.attributes;
}

function exemplarsFor(examples: readonly VoiceExample[], target: DraftTarget, ideaText: string) {
  return selectExemplars(examples, {
    text: ideaText,
    platform: target.kind === "post" ? target.platform : null,
    limit: EXEMPLARS_PER_TARGET,
  }).map((example) => ({ platform: example.platform, text: example.text }));
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

  try {
    await enforceRateLimit({ key: brandId, limit: DRAFT_RUNS_PER_HOUR, prefix: "draft:run", windowSeconds: HOUR_SECONDS });
  } catch (error) {
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

  const [settings, guide, preferences, examples, drafts, pieces] = await Promise.all([
    getBrandSettings(brandId),
    getActiveVoiceGuide(brandId),
    listVoicePreferences(brandId, PREFERENCES_LIMIT),
    listVoiceExamples(brandId, EXAMPLES_LIMIT),
    saved ? listDraftsForIdea(brandId, saved.id) : [],
    saved ? listPiecesForIdea(brandId, saved.id) : [],
  ]);
  // buildWriterMessage formats "now" in this zone and throws on a bad one.
  const zone = settings?.timezone ?? "UTC";
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
      sourceKind: firstUrl ? "link" : "text",
      sourceChannel: ideaSourceChannel(authAttributes(ctx)),
      sourceRef: firstUrl,
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
      now: new Date().toISOString(),
      timezone: isValidTimeZone(zone) ? zone : "UTC",
      voiceGuide: guide.body,
      preferences: preferences.map((preference) => preference.text),
      idea: idea.text,
      sources,
      allowLinksOnX: input.allowLinksOnX ?? false,
      redraft: input.redraft ?? false,
      targets: targets.map((target) => ({
        target,
        exemplars: exemplarsFor(examples, target, idea.text),
        existing: existingFor(target, drafts, pieces),
      })),
    },
  };
}

export async function saveDraftStep(input: SaveGeneratedDraftInput): ReturnType<typeof saveGeneratedDraft> {
  "use step";
  return saveGeneratedDraft(input);
}

export async function savePieceStep(input: Parameters<typeof saveContentPiece>[0]): ReturnType<typeof saveContentPiece> {
  "use step";
  return saveContentPiece(input);
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
}): Promise<void> {
  "use step";
  const attached = await setDraftMedia({
    brandId: input.brandId,
    draftId: input.draftId,
    revision: input.revision,
    mediaIds: [input.mediaId],
  });
  if (!attached) throw new Error("That draft changed before its image was added.");
}

export async function attachPieceImageStep(input: {
  readonly brandId: string;
  readonly pieceId: string;
  readonly mediaId: string;
}): Promise<void> {
  "use step";
  const attached = await setPieceMedia({ brandId: input.brandId, pieceId: input.pieceId, mediaIds: [input.mediaId] });
  if (!attached) throw new Error("That piece is gone.");
}
