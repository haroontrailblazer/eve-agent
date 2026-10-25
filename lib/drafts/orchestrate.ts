import type { AgentSendOptions } from "eve/tools";
import { hasLintErrors, lintPost, lintText, type LintIssue } from "@/lib/drafts/lint";
import type { ContentPieceRecord } from "@/lib/drafts/records";
import type { ReviewResult } from "@/lib/review";
import type { saveContentPiece, SaveGeneratedDraftInput, SaveGeneratedDraftResult } from "@/lib/drafts/store";
import { PIECE_KINDS, SOCIAL_PLATFORM_KEYS, targetKey, type DraftTarget, type PieceKind, type SocialPlatform } from "@/lib/drafts/types";
import {
  buildRepairMessage,
  buildRevisionMessage,
  buildWriterMessage,
  normalizeSuggestedTime,
  outputSchemaFor,
  parseWriterOutput,
  postsForPlatform,
  type CarouselOutput,
  type DraftSource,
  type PostOutput,
  type ReelOutput,
  type WriterBrief,
  type WriterOutput,
} from "@/lib/drafts/writer";

// Drafting runs inside the draft_posts workflow body, so this module stays
// deterministic: no clocks, no I/O. Everything with side effects comes in
// through DraftingDeps, which the tool binds to "use step" functions.

export type DraftSummary = {
  readonly draftId: string;
  readonly platform: SocialPlatform;
  readonly revision: number;
  readonly hook: string;
  readonly posts: readonly string[];
  readonly imageUrl: string | null;
  readonly imageError: string | null;
  readonly issues: readonly string[];
};

export type PieceSummary = {
  readonly pieceId: string;
  readonly kind: PieceKind;
  readonly title: string;
  readonly imageUrl: string | null;
};

export type DraftPostsResult =
  | {
      readonly ok: true;
      readonly ideaId: string;
      readonly drafts: readonly DraftSummary[];
      readonly pieces: readonly PieceSummary[];
      readonly skipped: readonly { readonly target: string; readonly reason: "already_drafted" }[];
      readonly failed: readonly { readonly target: string; readonly message: string }[];
    }
  | { readonly ok: false; readonly message: string };

export type WriterReply = { readonly ok: true; readonly data: unknown } | { readonly ok: false; readonly message: string };

export interface WriterConversation {
  ask(message: string, target: DraftTarget): Promise<WriterReply>;
}

export type DraftingPlan = {
  readonly ideaId: string;
  readonly now: string;
  readonly timezone: string;
  readonly voiceGuide: string;
  readonly preferences: readonly string[];
  readonly idea: string;
  readonly sources: readonly DraftSource[];
  readonly allowLinksOnX: boolean;
  readonly redraft: boolean;
  readonly targets: readonly {
    readonly target: DraftTarget;
    readonly exemplars: WriterBrief["exemplars"];
    readonly existing: { readonly draftId: string; readonly revision: number } | { readonly pieceId: string } | null;
  }[];
};

type PieceSaveInput = Parameters<typeof saveContentPiece>[0];

// saveContentPiece's result, or the idea being gone. Steps return expected
// misses instead of throwing them, so the workflow doesn't retry them.
export type SavePieceResult =
  | { readonly ok: true; readonly piece: ContentPieceRecord; readonly created: boolean }
  | { readonly ok: false; readonly reason: "idea_gone" };

// The tool binds brandId (and userId for images) to every step, so nothing
// here can write to another brand.
export interface DraftingDeps {
  openWriter(): WriterConversation;
  saveDraft(input: Omit<SaveGeneratedDraftInput, "brandId">): Promise<SaveGeneratedDraftResult>;
  savePiece(input: Omit<PieceSaveInput, "brandId">): Promise<SavePieceResult>;
  generateImage(
    prompt: string,
  ): Promise<{ readonly ok: true; readonly mediaId: string; readonly url: string } | { readonly ok: false; readonly message: string }>;
  // False when the draft moved on (or the piece is gone) before the image landed.
  attachDraftImage(input: { readonly draftId: string; readonly revision: number; readonly mediaId: string }): Promise<boolean>;
  attachPieceImage(input: { readonly pieceId: string; readonly mediaId: string }): Promise<boolean>;
  // Ends the idea's drafting request, so Studio offers Try again at once.
  clearIdeaRequest(): Promise<void>;
}

export const EMPTY_POST_MESSAGE = "The writer returned an empty post.";
export const DRAFT_CHANGED_MESSAGE = "That draft changed while harpy was writing.";
const IDEA_GONE_MESSAGE = "That idea is gone.";
const WRITER_FAILED_MESSAGE = "The writer failed.";
const WRITER_STOPPED_MESSAGE = "The writer stopped before finishing.";
const SAVE_FAILED_MESSAGE = "Couldn't save this draft. Try again.";
const IMAGE_FAILED_MESSAGE = "Image generation failed.";
const ATTACH_FAILED_MESSAGE = "The image was made but couldn't be added to the draft.";
const ATTACH_MISSED_MESSAGE = "That draft changed before its image was added.";

// The slice of eve's AgentSession the writer conversation uses.
export interface WriterSession {
  send(
    message: string,
    options: { readonly outputSchema: AgentSendOptions["outputSchema"]; readonly signal: AbortSignal },
  ): Promise<{
    result(): Promise<{ readonly status: string; readonly data?: unknown; readonly error?: { readonly message: string } }>;
  }>;
}

// One writer session per target; a repair is a second turn in the same session.
export function writerConversation(session: WriterSession, signal: AbortSignal): WriterConversation {
  return {
    async ask(message, target) {
      const response = await session.send(message, { outputSchema: outputSchemaFor(target), signal });
      const { status, data, error } = await response.result();
      if (status === "failed") return { ok: false, message: error?.message ?? WRITER_FAILED_MESSAGE };
      if (data === undefined || data === null) return { ok: false, message: WRITER_STOPPED_MESSAGE };
      return { ok: true, data };
    },
  };
}

type Written = { readonly ok: true; readonly output: WriterOutput; readonly issues: readonly LintIssue[] };
type WriteResult = Written | { readonly ok: false; readonly message: string };

function stringsIn(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsIn);
  if (value !== null && typeof value === "object") return Object.values(value).flatMap(stringsIn);
  return [];
}

// Normalizes the writer's posts and lints the result.
function review(brief: WriterBrief, output: WriterOutput): WriteResult {
  const { target } = brief;
  if (target.kind === "piece") {
    return { ok: true, output, issues: stringsIn(output).flatMap((text) => lintText(text)) };
  }
  const posts = postsForPlatform(target.platform, (output as PostOutput).posts);
  if (posts.length === 0) return { ok: false, message: EMPTY_POST_MESSAGE };
  return {
    ok: true,
    output: { ...(output as PostOutput), posts },
    issues: lintPost({ platform: target.platform, posts, allowLinks: brief.allowLinksOnX || target.platform !== "x" }),
  };
}

// Asks the writer once, and once more to repair lint errors. A repair turn
// that fails, throws, doesn't parse or comes back empty keeps the first
// output; whatever is returned carries its remaining issues.
export async function writeTarget(
  conversation: WriterConversation,
  brief: WriterBrief,
  mode:
    | { readonly kind: "draft" }
    | { readonly kind: "revise"; readonly currentPosts: readonly string[]; readonly instruction: string },
): Promise<WriteResult> {
  const message =
    mode.kind === "draft"
      ? buildWriterMessage(brief)
      : buildRevisionMessage({ brief, currentPosts: mode.currentPosts, instruction: mode.instruction });

  const first = await conversation.ask(message, brief.target);
  if (!first.ok) return first;
  const parsed = parseWriterOutput(brief.target, first.data);
  if (!parsed.ok) return parsed;
  const reviewed = review(brief, parsed.output);
  if (!reviewed.ok || !hasLintErrors(reviewed.issues)) return reviewed;

  const errors = reviewed.issues.filter((issue) => issue.severity === "error");
  let second: WriterReply;
  try {
    second = await conversation.ask(buildRepairMessage(errors), brief.target);
  } catch {
    return reviewed;
  }
  if (!second.ok) return reviewed;
  const repaired = parseWriterOutput(brief.target, second.data);
  if (!repaired.ok) return reviewed;
  const rereviewed = review(brief, repaired.output);
  return rereviewed.ok ? rereviewed : reviewed;
}

type PlanTarget = DraftingPlan["targets"][number];

type Outcome =
  | { readonly kind: "skipped"; readonly target: string }
  | { readonly kind: "failed"; readonly target: string; readonly message: string }
  | { readonly kind: "draft"; readonly summary: DraftSummary; readonly imagePrompt: string | null }
  | { readonly kind: "piece"; readonly summary: PieceSummary; readonly imagePrompt: string | null };

function briefFor(plan: DraftingPlan, entry: PlanTarget): WriterBrief {
  return {
    target: entry.target,
    now: plan.now,
    timezone: plan.timezone,
    voiceGuide: plan.voiceGuide,
    preferences: plan.preferences,
    exemplars: entry.exemplars,
    idea: plan.idea,
    sources: plan.sources,
    allowLinksOnX: plan.allowLinksOnX,
  };
}

// Errors that cross a step boundary may lose their class (or come from another
// realm), so match on name and message. Anything else gets a plain message
// instead of the raw error.
function thrownMessage(error: unknown, fallback: string): string {
  const { name, message } = (typeof error === "object" && error !== null ? error : {}) as {
    readonly name?: unknown;
    readonly message?: unknown;
  };
  if (name === "IdeaNotFoundError" || (typeof message === "string" && message.includes(IDEA_GONE_MESSAGE))) {
    return IDEA_GONE_MESSAGE;
  }
  return fallback;
}

async function savePost(
  deps: DraftingDeps,
  plan: DraftingPlan,
  entry: PlanTarget,
  platform: SocialPlatform,
  written: Written,
): Promise<Outcome> {
  const key = targetKey(entry.target);
  const output = written.output as PostOutput;
  const mode = entry.existing && "revision" in entry.existing ? { expectedRevision: entry.existing.revision } : "create";
  const saved = await deps.saveDraft({
    ideaId: plan.ideaId,
    platform,
    hook: output.hook,
    posts: output.posts,
    imagePrompt: output.imagePrompt,
    scheduledAt: normalizeSuggestedTime(output.suggestedTime, new Date(plan.now)),
    notes: output.notes,
    mode,
  });
  if (!saved.ok) {
    const message = saved.reason === "not_found" ? IDEA_GONE_MESSAGE : DRAFT_CHANGED_MESSAGE;
    return { kind: "failed", target: key, message };
  }
  // Another run created this draft first; ours was not written.
  if (mode === "create" && !saved.created) return { kind: "skipped", target: key };

  return {
    kind: "draft",
    imagePrompt: output.imagePrompt,
    summary: {
      draftId: saved.draft.id,
      platform,
      revision: saved.draft.revision,
      hook: saved.draft.hook,
      posts: saved.draft.posts,
      imageUrl: null,
      imageError: null,
      issues: written.issues.map((issue) => issue.message),
    },
  };
}

async function savePieceOutcome(
  deps: DraftingDeps,
  plan: DraftingPlan,
  entry: PlanTarget,
  kind: PieceKind,
  written: Written,
): Promise<Outcome> {
  const mode = entry.existing ? "replace" : "create";
  let title: string;
  let body: PieceSaveInput["body"];
  let imagePrompt: string | null = null;
  if (kind === "reel_script") {
    const { title: reelTitle, ...reelBody } = written.output as ReelOutput;
    title = reelTitle;
    body = reelBody;
  } else {
    const { title: carouselTitle, ...carouselBody } = written.output as CarouselOutput;
    title = carouselTitle;
    body = carouselBody;
    imagePrompt = carouselBody.coverImagePrompt;
  }

  const saved = await deps.savePiece({ ideaId: plan.ideaId, kind, title, body, mode });
  if (!saved.ok) return { kind: "failed", target: targetKey(entry.target), message: IDEA_GONE_MESSAGE };
  if (mode === "create" && !saved.created) return { kind: "skipped", target: targetKey(entry.target) };
  return {
    kind: "piece",
    imagePrompt,
    summary: { pieceId: saved.piece.id, kind, title: saved.piece.title, imageUrl: null },
  };
}

async function draftOne(deps: DraftingDeps, plan: DraftingPlan, entry: PlanTarget): Promise<Outcome> {
  const key = targetKey(entry.target);
  if (entry.existing && !plan.redraft) return { kind: "skipped", target: key };

  let written: WriteResult;
  try {
    written = await writeTarget(deps.openWriter(), briefFor(plan, entry), { kind: "draft" });
  } catch (error) {
    return { kind: "failed", target: key, message: thrownMessage(error, WRITER_FAILED_MESSAGE) };
  }
  if (!written.ok) return { kind: "failed", target: key, message: written.message };

  try {
    return entry.target.kind === "post"
      ? await savePost(deps, plan, entry, entry.target.platform, written)
      : await savePieceOutcome(deps, plan, entry, entry.target.piece, written);
  } catch (error) {
    return { kind: "failed", target: key, message: thrownMessage(error, SAVE_FAILED_MESSAGE) };
  }
}

// Makes and attaches one image. Failures are reported, never thrown.
async function addImage(
  deps: Pick<DraftingDeps, "generateImage">,
  prompt: string,
  attach: (mediaId: string) => Promise<boolean>,
): Promise<{ readonly url: string; readonly error: null } | { readonly url: null; readonly error: string }> {
  let image: Awaited<ReturnType<DraftingDeps["generateImage"]>>;
  try {
    image = await deps.generateImage(prompt);
  } catch {
    return { url: null, error: IMAGE_FAILED_MESSAGE };
  }
  if (!image.ok) return { url: null, error: image.message };
  let attached: boolean;
  try {
    attached = await attach(image.mediaId);
  } catch {
    return { url: null, error: ATTACH_FAILED_MESSAGE };
  }
  return attached ? { url: image.url, error: null } : { url: null, error: ATTACH_MISSED_MESSAGE };
}

function hasPrompt(prompt: string | null): prompt is string {
  return prompt !== null && prompt.trim() !== "";
}

// Drafts every target in parallel, saves each one, then makes the images in
// parallel. One target failing never stops the others.
export async function runDrafting(deps: DraftingDeps, plan: DraftingPlan): Promise<DraftPostsResult> {
  const outcomes = await Promise.all(plan.targets.map((entry) => draftOne(deps, plan, entry)));

  const withImages = await Promise.all(
    outcomes.map(async (outcome): Promise<Outcome> => {
      if (outcome.kind === "draft" && hasPrompt(outcome.imagePrompt)) {
        const { draftId, revision } = outcome.summary;
        const image = await addImage(deps, outcome.imagePrompt, (mediaId) =>
          deps.attachDraftImage({ draftId, revision, mediaId }),
        );
        return { ...outcome, summary: { ...outcome.summary, imageUrl: image.url, imageError: image.error } };
      }
      if (outcome.kind === "piece" && hasPrompt(outcome.imagePrompt)) {
        const { pieceId } = outcome.summary;
        const image = await addImage(deps, outcome.imagePrompt, (mediaId) => deps.attachPieceImage({ pieceId, mediaId }));
        return { ...outcome, summary: { ...outcome.summary, imageUrl: image.url } };
      }
      return outcome;
    }),
  );

  const drafts: DraftSummary[] = [];
  const pieces: PieceSummary[] = [];
  const skipped: { target: string; reason: "already_drafted" }[] = [];
  const failed: { target: string; message: string }[] = [];
  for (const outcome of withImages) {
    if (outcome.kind === "draft") drafts.push(outcome.summary);
    else if (outcome.kind === "piece") pieces.push(outcome.summary);
    else if (outcome.kind === "skipped") skipped.push({ target: outcome.target, reason: "already_drafted" });
    else failed.push({ target: outcome.target, message: outcome.message });
  }
  drafts.sort((a, b) => SOCIAL_PLATFORM_KEYS.indexOf(a.platform) - SOCIAL_PLATFORM_KEYS.indexOf(b.platform));
  pieces.sort((a, b) => PIECE_KINDS.indexOf(a.kind) - PIECE_KINDS.indexOf(b.kind));

  // A run with failed targets is over: without this, Studio would show the
  // idea as drafting until the request went stale.
  if (failed.length > 0) {
    try {
      await deps.clearIdeaRequest();
    } catch {
      // Best effort: the drafts and the failures are what the run reports.
    }
  }

  return { ok: true, ideaId: plan.ideaId, drafts, pieces, skipped, failed };
}

export type RevisionPlan = {
  readonly draftId: string;
  readonly revision: number;
  readonly brief: WriterBrief;
  readonly currentPosts: readonly string[];
  readonly instruction: string;
  readonly regenerateImage: boolean;
  readonly existingImagePrompt: string | null;
};

export interface RevisionDeps {
  openWriter(): WriterConversation;
  complete(input: {
    readonly hook: string;
    readonly posts: readonly string[];
    readonly imagePrompt: string | null;
  }): Promise<ReviewResult>;
  // Clears the draft's revision request.
  abandon(): Promise<void>;
  generateImage: DraftingDeps["generateImage"];
  attachDraftImage: DraftingDeps["attachDraftImage"];
}

export type ReviseDraftResult =
  | { readonly ok: true; readonly draft: DraftSummary }
  | { readonly ok: false; readonly message: string };

export const REVISION_STALE_MESSAGE = "That draft changed while harpy was writing. Try again on the latest version.";
const DRAFT_GONE_MESSAGE = "That draft is gone.";
const DRAFT_LOCKED_MESSAGE = "That draft can't be changed now.";

// Rewrites one saved draft. The revision request is cleared whenever the
// revision doesn't land, so the draft never stays marked as in progress.
export async function runRevision(deps: RevisionDeps, plan: RevisionPlan): Promise<ReviseDraftResult> {
  const abandon = async () => {
    try {
      await deps.abandon();
    } catch {
      // Best effort: the failure being reported matters more.
    }
  };
  const fail = async (message: string): Promise<ReviseDraftResult> => {
    await abandon();
    return { ok: false, message };
  };

  let written: WriteResult;
  try {
    written = await writeTarget(deps.openWriter(), plan.brief, {
      kind: "revise",
      currentPosts: plan.currentPosts,
      instruction: plan.instruction,
    });
  } catch (error) {
    return fail(thrownMessage(error, WRITER_FAILED_MESSAGE));
  }
  if (!written.ok) return fail(written.message);

  const output = written.output as PostOutput;
  const newPrompt = plan.regenerateImage && hasPrompt(output.imagePrompt) ? output.imagePrompt : null;

  let completed: ReviewResult;
  try {
    completed = await deps.complete({
      hook: output.hook,
      posts: output.posts,
      imagePrompt: newPrompt ?? plan.existingImagePrompt,
    });
  } catch (error) {
    await abandon();
    throw error;
  }
  if (!completed.ok) {
    if (completed.reason === "stale") return fail(REVISION_STALE_MESSAGE);
    return fail(completed.reason === "not_found" ? DRAFT_GONE_MESSAGE : DRAFT_LOCKED_MESSAGE);
  }

  const { draft } = completed;
  const summary: DraftSummary = {
    draftId: draft.id,
    platform: draft.platform,
    revision: draft.revision,
    hook: draft.hook,
    posts: draft.posts,
    imageUrl: null,
    imageError: null,
    issues: written.issues.map((issue) => issue.message),
  };
  if (newPrompt === null) return { ok: true, draft: summary };

  const image = await addImage(deps, newPrompt, (mediaId) =>
    deps.attachDraftImage({ draftId: draft.id, revision: draft.revision, mediaId }),
  );
  return { ok: true, draft: { ...summary, imageUrl: image.url, imageError: image.error } };
}
