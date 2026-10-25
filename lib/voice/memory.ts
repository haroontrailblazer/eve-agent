import { defineMemoryProvider } from "eve/memory";
import { defineTool } from "eve/tools";
import { z } from "zod";
import { PLATFORMS } from "@/lib/platforms";
import { selectExemplars } from "@/lib/voice/exemplars";
import { withRecallCache } from "@/lib/voice/recall-cache";
import {
  addVoicePreference,
  listVoiceExamples,
  listVoicePreferences,
  type VoiceExample,
  type VoicePreference,
} from "@/lib/voice/store";

const PREFERENCE_LIMIT = 30;
const EXAMPLE_LIMIT = 100;
const EXEMPLAR_LIMIT = 3;

type RecallMessage = { readonly id: string; readonly content: string };

// The text parts of a turn's input messages, joined by newlines. Anything that
// is not a message list gives "".
export function extractTurnText(input: unknown): string {
  if (!Array.isArray(input)) {
    return "";
  }

  const texts: string[] = [];

  for (const message of input) {
    const content = (message as { content?: unknown } | null)?.content;

    if (typeof content === "string") {
      texts.push(content);
    } else if (Array.isArray(content)) {
      for (const part of content) {
        const candidate = part as { type?: unknown; text?: unknown } | null;
        if (candidate?.type === "text" && typeof candidate.text === "string") {
          texts.push(candidate.text);
        }
      }
    }
  }

  return texts.join("\n");
}

export function buildVoiceRecall(input: {
  readonly preferences: readonly VoicePreference[];
  readonly exemplars: readonly VoiceExample[];
}): { readonly messages: readonly RecallMessage[] } {
  // Two stable keys, so each turn's recall supersedes the last and a deleted
  // preference stops applying in a long session.
  const preferences = input.preferences.length
    ? `Owner preferences:\n- ${input.preferences.map((preference) => preference.text).join("\n- ")}`
    : "The owner has stated no writing preferences.";
  const examples = input.exemplars.length
    ? input.exemplars
        .map((example) => {
          const label = example.platform ? PLATFORMS[example.platform].label : "post";
          return `An example of the owner's past ${label} writing:\n${example.text}`;
        })
        .join("\n\n")
    : "No example posts are saved.";

  return {
    messages: [
      { id: "voice:preferences", content: preferences },
      { id: "voice:examples", content: examples },
    ],
  };
}

function brandIdFrom(scopeValue: unknown): string | null {
  const id = Array.isArray(scopeValue) ? scopeValue[0] : scopeValue;
  return typeof id === "string" && id ? id : null;
}

export function voiceMemoryProvider() {
  return defineMemoryProvider({
    recall: {
      async "turn.started"(ctx) {
        const brandId = brandIdFrom(ctx.memory.scope.value);

        if (!brandId) {
          return null;
        }

        return withRecallCache(
          ctx.operationId,
          async () => {
            const [preferences, examples] = await Promise.all([
              listVoicePreferences(brandId, PREFERENCE_LIMIT),
              listVoiceExamples(brandId, EXAMPLE_LIMIT),
            ]);
            const exemplars = selectExemplars(examples, {
              text: extractTurnText(ctx.turn.input),
              platform: null,
              limit: EXEMPLAR_LIMIT,
            });

            return buildVoiceRecall({ preferences, exemplars });
          },
          undefined,
          ctx.abortSignal,
        );
      },
    },
    async tools(ctx) {
      const brandId = brandIdFrom(ctx.memory.scope.value);

      if (!brandId) {
        return null;
      }

      return {
        note_preference: defineTool({
          description:
            "Save a lasting writing preference the owner states, such as 'never use hashtags on LinkedIn'. Only for preferences the owner says should always apply.",
          inputSchema: z.object({ text: z.string().min(3).max(300) }),
          async execute({ text }) {
            await addVoicePreference({ brandId, text, source: "chat" });
            return { ok: true, saved: text };
          },
        }),
      };
    },
  });
}
