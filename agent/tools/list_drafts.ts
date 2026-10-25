import { defineTool } from "eve/tools";
import { z } from "zod";
import { listDrafts } from "@/lib/drafts/store";
import { DRAFT_STATES } from "@/lib/drafts/types";
import { resolveBrandContext } from "@/lib/mcp-context";

const FIRST_LINE_MAX_CHARS = 140;

function firstLine(text: string): string {
  const line = text.trim().split("\n")[0]?.trim() ?? "";
  return line.length > FIRST_LINE_MAX_CHARS ? line.slice(0, FIRST_LINE_MAX_CHARS) : line;
}

export default defineTool({
  description: "List the owner's saved drafts, newest activity first, optionally for one status.",
  inputSchema: z.object({
    status: z.enum(DRAFT_STATES).optional().describe("Only drafts in this status."),
    limit: z.number().int().min(1).max(20).optional().describe("How many to return. Defaults to 10."),
  }),
  async execute(input, ctx) {
    const brandContext = await resolveBrandContext(ctx);
    if (!brandContext) return { ok: false, message: "You need to be signed in to list drafts." };

    const drafts = await listDrafts(brandContext.brandId, { status: input.status, limit: input.limit ?? 10 });
    return {
      ok: true,
      drafts: drafts.map((draft) => ({
        draftId: draft.id,
        platform: draft.platform,
        status: draft.status,
        revision: draft.revision,
        firstLine: firstLine(draft.posts[0] ?? draft.text),
        scheduledAt: draft.scheduledAt,
      })),
    };
  },
});
