import type { SkillSummary } from "@/lib/skills/catalog";

export type ConnectionKey = "linear" | "notion" | "sentry";

export type EnabledConnections = Readonly<Record<ConnectionKey, boolean>>;

export const CONNECTION_LABELS: Readonly<Record<ConnectionKey, string>> = {
  linear: "Linear",
  notion: "Notion",
  sentry: "Sentry",
};

export function createConnectionClientContext(enabledConnections: EnabledConnections): string {
  const entries = Object.entries(CONNECTION_LABELS) as [ConnectionKey, string][];
  const enabled = entries
    .filter(([connection]) => enabledConnections[connection])
    .map(([, label]) => label);
  const disabled = entries
    .filter(([connection]) => !enabledConnections[connection])
    .map(([, label]) => label);

  if (enabled.length > 0) {
    const disabledContext =
      disabled.length > 0
        ? ` Do not use disabled connections unless the user enables them first: ${disabled.join(", ")}.`
        : "";

    return `The user has enabled these external connections for this turn: ${enabled.join(", ")}. Use an enabled connection when it is relevant to the user's request.${disabledContext}`;
  }

  return "The user has disabled all external connections for this turn. Do not search or call connection tools unless the user enables a connection first.";
}

// The instruction for a skill the user invoked from the slash menu, when the
// message begins with "/slug".
export function buildSkillClientContext(
  message: string,
  skills: readonly SkillSummary[] | null,
): string | null {
  if (!skills || !message.startsWith("/")) {
    return null;
  }

  const match = message.match(/^\/([\w-]+)/);

  if (!match) {
    return null;
  }

  const slug = match[1]!.toLowerCase();
  const skill = skills.find((entry) => entry.slug === slug);

  if (!skill || !skill.prompt.trim()) {
    return null;
  }

  return `The user invoked the "/${skill.slug}" skill. Treat the text after the "/${skill.slug}" command as the input and apply this instruction to it: ${skill.prompt.trim()}`;
}

export function buildAttachmentClientContext(hostedImageUrls: readonly string[]): string | null {
  if (hostedImageUrls.length === 0) {
    return null;
  }

  const noun = hostedImageUrls.length === 1 ? "image" : "images";

  return `The user attached ${hostedImageUrls.length} ${noun}, hosted at: ${hostedImageUrls.join(", ")}. To edit, enhance, upscale, restyle, or otherwise transform an attached image, call generate_image with sourceImageUrl set to that hosted URL. Do not ask the user for a link.`;
}

// Per-turn client context: the connection context first, then the skill and
// attachment context when they apply.
export function buildTurnClientContext(input: {
  readonly message: string;
  readonly enabled: EnabledConnections;
  readonly skills: readonly SkillSummary[] | null;
  readonly hostedImageUrls: readonly string[];
}): string[] {
  return [
    createConnectionClientContext(input.enabled),
    buildSkillClientContext(input.message, input.skills),
    buildAttachmentClientContext(input.hostedImageUrls),
  ].filter((entry): entry is string => entry !== null);
}
