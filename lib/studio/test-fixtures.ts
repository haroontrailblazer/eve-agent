import type { DraftRecord, IdeaRecord } from "@/lib/drafts/records";
import type { StudioDraft, StudioIdea, StudioSnapshot } from "@/lib/studio/types";

export function studioDraft(overrides: Partial<StudioDraft> = {}): StudioDraft {
  const text = overrides.text ?? overrides.posts?.join("\n---\n") ?? "A draft.";
  const base: DraftRecord = {
    id: "draft-1",
    ideaId: "idea-1",
    brandId: "brand-1",
    platform: "x",
    status: "pending_review",
    revision: 1,
    hook: "",
    text,
    posts: overrides.posts ?? [text],
    mediaIds: [],
    imagePrompt: null,
    scheduledAt: null,
    approvedAt: null,
    approvedVia: null,
    notes: "",
    revisionRequestedAt: null,
    externalUrl: null,
    createdAt: "2026-10-24T08:00:00.000Z",
    updatedAt: "2026-10-24T08:00:00.000Z",
  };
  return { ...base, imageUrl: null, ...overrides };
}

export function studioIdea(
  overrides: Partial<Omit<StudioIdea, "requested">> & { requested?: Partial<IdeaRecord["requested"]> } = {},
): StudioIdea {
  const { requested, ...rest } = overrides;
  return {
    id: "idea-1",
    brandId: "brand-1",
    text: "An idea.",
    sourceKind: "text",
    sourceChannel: "studio",
    sourceRef: null,
    requested: { platforms: [], pieces: [], ...requested },
    draftRequestedAt: null,
    createdAt: "2026-10-24T08:00:00.000Z",
    drafts: [],
    pieces: [],
    ...rest,
  };
}

export function snapshot(overrides: Partial<StudioSnapshot> = {}): StudioSnapshot {
  return { timezone: "UTC", now: "2026-10-24T10:00:00.000Z", ideas: [], upNext: [], ...overrides };
}
