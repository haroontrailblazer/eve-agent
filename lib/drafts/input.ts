import { z } from "zod";
import { IDEA_MAX_CHARS } from "@/lib/drafts/limits";
import {
  PIECE_KINDS,
  SOCIAL_PLATFORM_KEYS,
  type DraftTarget,
  type IdeaRequest,
  type IdeaSourceChannel,
  type PieceKind,
  type SocialPlatform,
} from "@/lib/drafts/types";
import { MAX_SOURCES } from "@/lib/drafts/writer";

// draft_posts input and target resolution. Pure, so the workflow body can use it.

export const DRAFT_POSTS_INPUT = z.object({
  ideaId: z.string().min(1).optional().describe("The id of a saved idea. Pass it for Studio requests."),
  idea: z
    .string()
    .min(1)
    .max(IDEA_MAX_CHARS)
    .optional()
    .describe("The idea to draft, in the owner's words. Pass it when there is no ideaId."),
  sources: z
    .array(
      z.object({
        url: z.string().optional(),
        title: z.string().optional(),
        text: z.string().min(1).describe("The text you fetched or the owner pasted."),
      }),
    )
    .max(MAX_SOURCES)
    .optional()
    .describe("Up to 3 sources the drafts should draw on."),
  platforms: z
    .array(z.enum(SOCIAL_PLATFORM_KEYS))
    .optional()
    .describe("Platforms to draft for. Omit for the idea's saved choice, or all three."),
  pieces: z
    .array(z.enum(PIECE_KINDS))
    .optional()
    .describe("Extra pieces: a reel script or a carousel outline. Only when asked."),
  redraft: z.boolean().optional().describe("Rewrite drafts that already exist for this idea."),
  allowLinksOnX: z.boolean().optional().describe("Allow a link in the X draft. Links on X cost $0.20 a post."),
});

export type DraftPostsInput = z.infer<typeof DRAFT_POSTS_INPUT>;

function inOrder<T extends string>(order: readonly T[], values: readonly T[]): T[] {
  return order.filter((value) => values.includes(value));
}

// Explicit input wins; else the idea's requested set; else all three
// platforms. Deduped, platforms first in x, linkedin, threads order.
export function resolveTargets(
  input: { readonly platforms?: readonly SocialPlatform[]; readonly pieces?: readonly PieceKind[] },
  requested: IdeaRequest | null,
): DraftTarget[] {
  const explicit = (input.platforms?.length ?? 0) + (input.pieces?.length ?? 0) > 0;
  const fromIdea = requested !== null && requested.platforms.length + requested.pieces.length > 0;
  const chosen: IdeaRequest = explicit
    ? { platforms: input.platforms ?? [], pieces: input.pieces ?? [] }
    : fromIdea
      ? requested
      : { platforms: SOCIAL_PLATFORM_KEYS, pieces: [] };

  return [
    ...inOrder(SOCIAL_PLATFORM_KEYS, chosen.platforms).map((platform) => ({ kind: "post" as const, platform })),
    ...inOrder(PIECE_KINDS, chosen.pieces).map((piece) => ({ kind: "piece" as const, piece })),
  ];
}

const CHAT_CHANNELS = ["web", "whatsapp", "slack", "eval"] as const satisfies readonly IdeaSourceChannel[];

// Where a chat-made idea came from, read from the session's auth attributes.
// Never "studio": only createIdeaAction sets that.
export function ideaSourceChannel(attributes: Record<string, unknown> | undefined): IdeaSourceChannel {
  const channel = attributes?.channel;
  return CHAT_CHANNELS.find((known) => known === channel) ?? "web";
}
