import { describe, expect, it, vi } from "vitest";
import {
  runDrafting,
  writerConversation,
  writeTarget,
  type DraftingDeps,
  type DraftingPlan,
  type WriterReply,
} from "@/lib/drafts/orchestrate";
import type { ContentPieceRecord, DraftRecord } from "@/lib/drafts/records";
import type { SaveGeneratedDraftInput } from "@/lib/drafts/store";
import { isSocialPlatform, type DraftTarget, type PieceKind, type SocialPlatform } from "@/lib/drafts/types";
import { CAROUSEL_OUTPUT_SCHEMA, POST_OUTPUT_SCHEMA, type WriterBrief } from "@/lib/drafts/writer";

type Short = SocialPlatform | PieceKind;
type Existing = DraftingPlan["targets"][number]["existing"];

const post = (platform: string, posts: string[], extra = {}): WriterReply => ({
  ok: true,
  data: { platform, hook: "h", posts, imagePrompt: null, suggestedTime: null, notes: "", ...extra },
});

const carousel = (extra = {}): WriterReply => ({
  ok: true,
  data: {
    title: "T",
    slides: [
      { heading: "a", body: "b" },
      { heading: "c", body: "d" },
      { heading: "e", body: "f" },
    ],
    coverImagePrompt: "cover",
    caption: "c",
    notes: "",
    ...extra,
  },
});

const reel = (extra = {}): WriterReply => ({
  ok: true,
  data: {
    title: "Reel",
    hook: "Watch this",
    beats: [
      { visual: "desk", voiceover: "one", onScreenText: "1" },
      { visual: "door", voiceover: "two", onScreenText: "2" },
      { visual: "street", voiceover: "three", onScreenText: "3" },
    ],
    caption: "c",
    notes: "",
    ...extra,
  },
});

function toTarget(name: Short): DraftTarget {
  return isSocialPlatform(name) ? { kind: "post", platform: name } : { kind: "piece", piece: name };
}

function shortName(target: DraftTarget): Short {
  return target.kind === "post" ? target.platform : target.piece;
}

function plan(input: {
  readonly targets: readonly Short[];
  readonly existing?: Partial<Record<Short, Existing>>;
  readonly redraft?: boolean;
  readonly now?: string;
  readonly allowLinksOnX?: boolean;
}): DraftingPlan {
  return {
    ideaId: "idea-1",
    now: input.now ?? "2026-10-24T10:00:00Z",
    timezone: "UTC",
    voiceGuide: "Write plainly.",
    preferences: ["No hashtags"],
    idea: "Small teams ship faster",
    sources: [],
    allowLinksOnX: input.allowLinksOnX ?? false,
    redraft: input.redraft ?? false,
    targets: input.targets.map((name) => ({
      target: toTarget(name),
      exemplars: [],
      existing: input.existing?.[name] ?? null,
    })),
  };
}

function draftRecord(input: Omit<SaveGeneratedDraftInput, "brandId">, id: string, revision: number): DraftRecord {
  return {
    id,
    ideaId: input.ideaId,
    brandId: "brand-1",
    platform: input.platform,
    status: "pending_review",
    revision,
    hook: input.hook,
    text: input.posts.join("\n\n"),
    posts: input.posts,
    mediaIds: [],
    imagePrompt: input.imagePrompt,
    scheduledAt: input.scheduledAt,
    approvedAt: null,
    approvedVia: null,
    notes: input.notes,
    revisionRequestedAt: null,
    externalUrl: null,
    createdAt: "2026-10-24T10:00:00.000Z",
    updatedAt: "2026-10-24T10:00:00.000Z",
  };
}

function fakeDeps(options: {
  readonly replies: Partial<Record<Short, WriterReply[]>>;
  readonly imageFails?: boolean;
  readonly attachFails?: boolean;
  readonly saveResult?: "stale" | "already_there";
  readonly pieceThrows?: Error;
}) {
  const asked: Record<Short, string[]> = { x: [], linkedin: [], threads: [], reel_script: [], carousel_outline: [] };
  const saved: Omit<SaveGeneratedDraftInput, "brandId">[] = [];
  const savedPieces: Parameters<DraftingDeps["savePiece"]>[0][] = [];
  const attached: { readonly id: string; readonly mediaId: string }[] = [];
  const prompts: string[] = [];
  const writers = { opened: 0 };

  const deps: DraftingDeps = {
    openWriter() {
      writers.opened += 1;
      return {
        async ask(message, target) {
          const name = shortName(target);
          asked[name].push(message);
          return options.replies[name]?.shift() ?? { ok: false, message: "No reply queued." };
        },
      };
    },
    async saveDraft(input) {
      saved.push(input);
      if (options.saveResult === "stale") return { ok: false, reason: "stale", draft: null };
      if (options.saveResult === "already_there") {
        return { ok: true, draft: draftRecord(input, "draft-other", 1), created: false };
      }
      const revision = input.mode === "create" ? 1 : input.mode.expectedRevision + 1;
      return { ok: true, draft: draftRecord(input, `draft-${input.platform}`, revision), created: input.mode === "create" };
    },
    async savePiece(input) {
      savedPieces.push(input);
      if (options.pieceThrows) throw options.pieceThrows;
      const piece: ContentPieceRecord = {
        id: `piece-${input.kind}`,
        ideaId: input.ideaId,
        brandId: "brand-1",
        kind: input.kind,
        title: input.title,
        body: input.body,
        mediaIds: [],
        createdAt: "2026-10-24T10:00:00.000Z",
        updatedAt: "2026-10-24T10:00:00.000Z",
      };
      return { piece, created: input.mode === "create" };
    },
    async generateImage(prompt) {
      prompts.push(prompt);
      if (options.imageFails) return { ok: false, message: "Image generation failed: boom." };
      return { ok: true, mediaId: `media-${prompts.length}`, url: `https://blob.example/media-${prompts.length}.png` };
    },
    async attachDraftImage(input) {
      if (options.attachFails) throw new Error("revision moved");
      attached.push({ id: input.draftId, mediaId: input.mediaId });
    },
    async attachPieceImage(input) {
      attached.push({ id: input.pieceId, mediaId: input.mediaId });
    },
  };

  return Object.assign(deps, {
    asked,
    saved,
    savedPieces,
    attached,
    prompts,
    writers,
  });
}

describe("runDrafting", () => {
  it("drafts every target in parallel and returns them in platform order", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["Ship small."])], linkedin: [post("linkedin", ["Long form."])], threads: [post("threads", ["Chatty."])] } });
    const result = await runDrafting(deps, plan({ targets: ["x", "linkedin", "threads"] }));
    expect(result).toMatchObject({ ok: true, failed: [], skipped: [] });
    expect(result.ok && result.drafts.map((d) => d.platform)).toEqual(["x", "linkedin", "threads"]);
    expect(deps.saved.map((s) => s.mode)).toEqual(["create", "create", "create"]);
    expect(deps.writers.opened).toBe(3);
  });

  it("lists drafts in platform order even when the plan does not", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a"])], threads: [post("threads", ["b"])], linkedin: [post("linkedin", ["c"])] } });
    const result = await runDrafting(deps, plan({ targets: ["threads", "linkedin", "x"] }));
    expect(result.ok && result.drafts.map((d) => d.platform)).toEqual(["x", "linkedin", "threads"]);
  });

  it("asks for one repair when lint finds errors, and only one", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a".repeat(300)]), post("x", ["b".repeat(300)])] } });
    const result = await runDrafting(deps, plan({ targets: ["x"] }));
    expect(deps.asked.x).toHaveLength(2);
    expect(deps.asked.x[1]).toContain("280");
    expect(result.ok && result.drafts[0]!.issues.length).toBeGreaterThan(0); // saved with warnings
    expect(deps.saved[0]!.posts).toEqual(["b".repeat(300)]);
  });

  it("saves the repaired draft without issues when the repair fixes it", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a".repeat(300)]), post("x", ["Short now."])] } });
    const result = await runDrafting(deps, plan({ targets: ["x"] }));
    expect(result).toMatchObject({ ok: true, drafts: [{ platform: "x", posts: ["Short now."], issues: [] }] });
  });

  it("reports one failed target and keeps the others", async () => {
    const deps = fakeDeps({ replies: { x: [{ ok: false, message: "boom" }], threads: [post("threads", ["ok"])] } });
    const result = await runDrafting(deps, plan({ targets: ["x", "threads"] }));
    expect(result).toMatchObject({ ok: true, failed: [{ target: "post:x", message: "boom" }] });
    expect(result.ok && result.drafts.map((d) => d.platform)).toEqual(["threads"]);
  });

  it("fails a target whose posts are all blank", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["  "])] } });
    expect(await runDrafting(deps, plan({ targets: ["x"] }))).toMatchObject({
      failed: [{ target: "post:x", message: "The writer returned an empty post." }],
    });
    expect(deps.saved).toHaveLength(0);
  });

  it("skips targets that already exist unless redrafting", async () => {
    const deps = fakeDeps({ replies: {} });
    const result = await runDrafting(deps, plan({ targets: ["x"], existing: { x: { draftId: "d1", revision: 2 } } }));
    expect(result).toMatchObject({ skipped: [{ target: "post:x", reason: "already_drafted" }] });
    expect(deps.asked.x ?? []).toHaveLength(0);
  });

  it("redrafts an existing draft as a new revision", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["New."])] } });
    await runDrafting(deps, plan({ targets: ["x"], existing: { x: { draftId: "d1", revision: 2 } }, redraft: true }));
    expect(deps.saved[0]!.mode).toEqual({ expectedRevision: 2 });
  });

  it("reports a redraft that lost the race as changed", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["New."])] }, saveResult: "stale" });
    const result = await runDrafting(deps, plan({ targets: ["x"], existing: { x: { draftId: "d1", revision: 2 } }, redraft: true }));
    expect(result).toMatchObject({ ok: true, drafts: [], failed: [{ target: "post:x", message: "That draft changed while harpy was writing." }] });
  });

  it("skips a draft another run created first", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a"], { imagePrompt: "a desk" })] }, saveResult: "already_there" });
    const result = await runDrafting(deps, plan({ targets: ["x"] }));
    expect(result).toMatchObject({ ok: true, drafts: [], skipped: [{ target: "post:x", reason: "already_drafted" }] });
    expect(deps.prompts).toHaveLength(0);
  });

  it("drops a bad suggested time and keeps a good one", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a"], { suggestedTime: "2020-01-01T00:00:00Z" })], threads: [post("threads", ["b"], { suggestedTime: "2026-10-25T09:00:00Z" })] } });
    await runDrafting(deps, plan({ targets: ["x", "threads"], now: "2026-10-24T10:00:00Z" }));
    expect(deps.saved.map((s) => s.scheduledAt)).toEqual([null, "2026-10-25T09:00:00.000Z"]);
  });

  it("saves the notes and the image prompt", async () => {
    const deps = fakeDeps({ replies: { linkedin: [post("linkedin", ["a ", " b"], { notes: "Post early.", imagePrompt: "a desk" })] } });
    await runDrafting(deps, plan({ targets: ["linkedin"] }));
    expect(deps.saved[0]).toMatchObject({ ideaId: "idea-1", platform: "linkedin", hook: "h", posts: ["a\n\nb"], notes: "Post early.", imagePrompt: "a desk" });
  });

  it("generates and attaches an image after saving", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a"], { imagePrompt: "a desk" })] } });
    const result = await runDrafting(deps, plan({ targets: ["x"] }));
    expect(result).toMatchObject({ ok: true, drafts: [{ imageUrl: "https://blob.example/media-1.png", imageError: null }] });
    expect(deps.attached).toEqual([{ id: "draft-x", mediaId: "media-1" }]);
  });

  it("saves the draft even when its image fails", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a"], { imagePrompt: "a desk" })] }, imageFails: true });
    const result = await runDrafting(deps, plan({ targets: ["x"] }));
    expect(result).toMatchObject({ ok: true, failed: [], drafts: [{ platform: "x", imageUrl: null, imageError: expect.any(String) }] });
  });

  it("keeps the draft when its image can't be attached", async () => {
    const deps = fakeDeps({ replies: { x: [post("x", ["a"], { imagePrompt: "a desk" })] }, attachFails: true });
    const result = await runDrafting(deps, plan({ targets: ["x"] }));
    expect(result).toMatchObject({ ok: true, failed: [], drafts: [{ platform: "x", imageUrl: null, imageError: expect.any(String) }] });
  });

  it("saves a carousel and generates its cover", async () => {
    const deps = fakeDeps({ replies: { carousel_outline: [{ ok: true, data: { title: "T", slides: [{ heading: "a", body: "b" }, { heading: "c", body: "d" }, { heading: "e", body: "f" }], coverImagePrompt: "cover", caption: "c", notes: "" } }] } });
    const result = await runDrafting(deps, plan({ targets: ["carousel_outline"] }));
    expect(result).toMatchObject({ ok: true, pieces: [{ kind: "carousel_outline", imageUrl: expect.any(String) }] });
    expect(deps.savedPieces[0]).toEqual({
      ideaId: "idea-1",
      kind: "carousel_outline",
      title: "T",
      body: { slides: [{ heading: "a", body: "b" }, { heading: "c", body: "d" }, { heading: "e", body: "f" }], coverImagePrompt: "cover", caption: "c", notes: "" },
      mode: "create",
    });
    expect(deps.attached).toEqual([{ id: "piece-carousel_outline", mediaId: "media-1" }]);
  });

  it("replaces an existing piece when redrafting", async () => {
    const deps = fakeDeps({ replies: { reel_script: [reel()] } });
    const result = await runDrafting(deps, plan({ targets: ["reel_script"], existing: { reel_script: { pieceId: "p1" } }, redraft: true }));
    expect(deps.savedPieces[0]).toMatchObject({ kind: "reel_script", title: "Reel", mode: "replace" });
    expect(deps.savedPieces[0]!.body).not.toHaveProperty("title");
    expect(result).toMatchObject({ ok: true, pieces: [{ pieceId: "piece-reel_script", kind: "reel_script", title: "Reel", imageUrl: null }] });
  });

  it("reports a piece whose idea is gone", async () => {
    const gone = Object.assign(new Error("That idea is gone."), { name: "IdeaNotFoundError" });
    const deps = fakeDeps({ replies: { reel_script: [reel()], x: [post("x", ["a"])] }, pieceThrows: gone });
    const result = await runDrafting(deps, plan({ targets: ["x", "reel_script"] }));
    expect(result).toMatchObject({ ok: true, drafts: [{ platform: "x" }], failed: [{ target: "piece:reel_script", message: "That idea is gone." }] });
  });

  it("reports a thrown save with a plain message and keeps the other targets", async () => {
    const deps = fakeDeps({ replies: { reel_script: [reel()], x: [post("x", ["a"])] }, pieceThrows: new Error('relation "content_piece" does not exist') });
    const result = await runDrafting(deps, plan({ targets: ["x", "reel_script"] }));
    expect(result).toMatchObject({ ok: true, drafts: [{ platform: "x" }], failed: [{ target: "piece:reel_script" }] });
    expect(result.ok && result.failed[0]!.message).not.toContain("relation");
  });

  it("reports a writer that throws as a failed target", async () => {
    const deps = fakeDeps({ replies: { threads: [post("threads", ["ok"])] } });
    const throwing: DraftingDeps = {
      ...deps,
      openWriter: () => ({
        async ask(message, target) {
          if (target.kind === "post" && target.platform === "x") throw new Error("socket hang up");
          return deps.openWriter().ask(message, target);
        },
      }),
    };
    const result = await runDrafting(throwing, plan({ targets: ["x", "threads"] }));
    expect(result).toMatchObject({ ok: true, drafts: [{ platform: "threads" }], failed: [{ target: "post:x", message: "The writer failed." }] });
  });
});

describe("writeTarget", () => {
  const brief = (target: DraftTarget, allowLinksOnX = false): WriterBrief => ({
    target,
    now: "2026-10-24T10:00:00Z",
    timezone: "UTC",
    voiceGuide: "Write plainly.",
    preferences: [],
    exemplars: [],
    idea: "Small teams ship faster",
    sources: [],
    allowLinksOnX,
  });

  function scripted(replies: WriterReply[]) {
    const asked: string[] = [];
    return {
      asked,
      conversation: {
        async ask(message: string) {
          asked.push(message);
          return replies.shift() ?? { ok: false as const, message: "No reply queued." };
        },
      },
    };
  }

  it("keeps the first output when the repair fails to parse", async () => {
    const { conversation, asked } = scripted([post("x", ["a".repeat(300)]), { ok: true, data: { nope: true } }]);
    const result = await writeTarget(conversation, brief({ kind: "post", platform: "x" }), { kind: "draft" });
    expect(asked).toHaveLength(2);
    expect(result).toMatchObject({ ok: true, output: { posts: ["a".repeat(300)] } });
    expect(result.ok && result.issues.some((i) => i.code === "too_long")).toBe(true);
  });

  it("fails on a first answer of the wrong shape without a repair", async () => {
    const { conversation, asked } = scripted([{ ok: true, data: { nope: true } }]);
    expect(await writeTarget(conversation, brief({ kind: "post", platform: "x" }), { kind: "draft" })).toMatchObject({ ok: false });
    expect(asked).toHaveLength(1);
  });

  it("does not repair warnings", async () => {
    const { conversation, asked } = scripted([post("x", ["Ship #a #b #c"])]);
    const result = await writeTarget(conversation, brief({ kind: "post", platform: "x" }), { kind: "draft" });
    expect(asked).toHaveLength(1);
    expect(result.ok && result.issues.map((i) => i.severity)).toEqual(["warning"]);
  });

  it("allows a link on X only when the brief allows it", async () => {
    const link = () => scripted([post("x", ["Read https://a.co"]), post("x", ["Read https://a.co"])]);
    const blocked = link();
    await writeTarget(blocked.conversation, brief({ kind: "post", platform: "x" }), { kind: "draft" });
    expect(blocked.asked).toHaveLength(2);
    const allowed = link();
    await writeTarget(allowed.conversation, brief({ kind: "post", platform: "x" }, true), { kind: "draft" });
    expect(allowed.asked).toHaveLength(1);
  });

  it("lints every string field of a piece", async () => {
    const { conversation, asked } = scripted([carousel({ caption: "Fast — and small" }), carousel()]);
    const result = await writeTarget(conversation, brief({ kind: "piece", piece: "carousel_outline" }), { kind: "draft" });
    expect(asked).toHaveLength(2);
    expect(asked[1]).toContain("em dash");
    expect(result).toMatchObject({ ok: true, issues: [] });
  });

  it("starts a revision with the current draft and the requested change", async () => {
    const { conversation, asked } = scripted([post("x", ["Better."])]);
    await writeTarget(conversation, brief({ kind: "post", platform: "x" }), {
      kind: "revise",
      currentPosts: ["Old post."],
      instruction: "Make it shorter",
    });
    expect(asked[0]).toContain("Old post.");
    expect(asked[0]).toContain("Make it shorter");
  });
});

describe("writerConversation", () => {
  function session(result: { status: "waiting" | "completed" | "failed"; data?: unknown; error?: { message: string } }) {
    const send = vi.fn(async (_message: string, _options?: unknown) => ({ result: async () => result }));
    return { send };
  }
  const signal = new AbortController().signal;

  it("sends the target's output schema and the call's signal", async () => {
    const fake = session({ status: "waiting", data: { ok: 1 } });
    const reply = await writerConversation(fake, signal).ask("hello", { kind: "post", platform: "x" });
    expect(reply).toEqual({ ok: true, data: { ok: 1 } });
    expect(fake.send).toHaveBeenCalledWith("hello", { outputSchema: POST_OUTPUT_SCHEMA, signal });
    await writerConversation(fake, signal).ask("again", { kind: "piece", piece: "carousel_outline" });
    expect(fake.send).toHaveBeenLastCalledWith("again", { outputSchema: CAROUSEL_OUTPUT_SCHEMA, signal });
  });

  it("maps a failed turn to its error message", async () => {
    expect(await writerConversation(session({ status: "failed", error: { message: "overloaded" } }), signal).ask("m", { kind: "post", platform: "x" })).toEqual({ ok: false, message: "overloaded" });
    expect(await writerConversation(session({ status: "failed" }), signal).ask("m", { kind: "post", platform: "x" })).toEqual({ ok: false, message: "The writer failed." });
  });

  it("maps a turn without data to a stopped writer", async () => {
    expect(await writerConversation(session({ status: "waiting" }), signal).ask("m", { kind: "post", platform: "x" })).toEqual({
      ok: false,
      message: "The writer stopped before finishing.",
    });
  });
});
