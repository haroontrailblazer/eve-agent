import type { EveAuthorizationPart, EveMessage } from "eve/react";

// Sign-ins the turn is still waiting on, in message order.
export function getPendingAuthorizations(
  messages: readonly EveMessage[],
): readonly EveAuthorizationPart[] {
  return messages.flatMap((message) =>
    message.parts.filter(
      (part): part is EveAuthorizationPart =>
        part.type === "authorization" && part.state === "required",
    ),
  );
}

export function getAuthorizationDisabledReason(
  pending: readonly EveAuthorizationPart[],
): string | undefined {
  const first = pending[0];

  return first ? `Connect ${first.displayName} to continue this turn, or skip it.` : undefined;
}

export function authorizationKey(part: EveAuthorizationPart): string {
  return part.attemptId ?? `${part.turnId}:${part.stepIndex}:${part.name}`;
}
