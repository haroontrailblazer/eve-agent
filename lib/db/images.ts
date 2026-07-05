import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { generatedImage, type GeneratedImage } from "@/lib/db/schema";

// Images the agent generates/edits are stored here (base64) and served as
// hosted URLs via /api/images/[id], so they can be embedded in chat as markdown
// instead of bloating the message with a giant data URL.

export async function saveGeneratedImage(input: {
  readonly userId: string;
  readonly mediaType: string;
  readonly base64: string;
  readonly prompt?: string;
}): Promise<string> {
  const id = randomUUID();

  await db.insert(generatedImage).values({
    id,
    userId: input.userId,
    mediaType: input.mediaType,
    data: input.base64,
    prompt: input.prompt ?? "",
    createdAt: new Date(),
  });

  return id;
}

export async function getGeneratedImage(id: string): Promise<GeneratedImage | null> {
  const rows = await db
    .select()
    .from(generatedImage)
    .where(eq(generatedImage.id, id))
    .limit(1);

  return rows[0] ?? null;
}
