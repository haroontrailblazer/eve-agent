import type { AuthResult } from "eve/channels/auth";
import { resolveChannelAuth } from "@/lib/channel-auth";
import { parseLinkCommand, redeemLinkCode } from "@/lib/link-codes";

// eve does not export SessionAuthContext; AuthResult extends it, and it is
// what defaultSlackAuth returns in shape.
type SlackAuth = Pick<
  AuthResult,
  "attributes" | "authenticator" | "issuer" | "principalId" | "principalType" | "subject"
>;

export const SLACK_COPY = {
  linked: (email: string) => `Linked. harpy knows you as ${email}.`,
  linkFailed: "That code didn't work. Make a new one on harpy's Channels page.",
  unlinked:
    "Link your Slack account first: open Channels in harpy, choose Link Slack, and send me the code here.",
} as const;

function stringAttribute(auth: SlackAuth, name: string): string | null {
  const value = auth.attributes[name];

  return typeof value === "string" && value ? value : null;
}

// "<team>:<user>", the key a Slack identity is linked under.
export function slackExternalId(auth: SlackAuth | null): string | null {
  if (!auth) {
    return null;
  }

  const userId = stringAttribute(auth, "user_id");
  const teamId = stringAttribute(auth, "team_id") ?? /^slack:([^:]+)/.exec(auth.issuer ?? "")?.[1];

  return userId && teamId ? `${teamId}:${userId}` : null;
}

// The owner principal for a linked Slack user, or null when unlinked.
export async function resolveSlackAuth(defaultAuth: SlackAuth | null): Promise<AuthResult | null> {
  const externalId = slackExternalId(defaultAuth);

  if (!defaultAuth || !externalId) {
    return null;
  }

  const extraAttributes: Record<string, string> = {};

  for (const [name, value] of Object.entries(defaultAuth.attributes)) {
    if (typeof value === "string") {
      extraAttributes[name] = value;
    }
  }

  return resolveChannelAuth({ channel: "slack", externalId, extraAttributes });
}

export type SlackInboundDecision =
  | { readonly kind: "turn"; readonly auth: AuthResult }
  | { readonly kind: "reply"; readonly text: string }
  | { readonly kind: "drop" };

export async function decideSlackInbound(input: {
  readonly defaultAuth: SlackAuth | null;
  readonly text: string;
  readonly isDirect: boolean;
  readonly isMention: boolean;
}): Promise<SlackInboundDecision> {
  const code = input.isDirect ? parseLinkCommand(input.text) : null;
  const externalId = slackExternalId(input.defaultAuth);

  if (code && externalId) {
    const result = await redeemLinkCode({ channel: "slack", code, externalId });

    return {
      kind: "reply",
      text: result.ok ? SLACK_COPY.linked(result.email) : SLACK_COPY.linkFailed,
    };
  }

  const auth = await resolveSlackAuth(input.defaultAuth);

  if (auth) {
    return { auth, kind: "turn" };
  }

  return input.isDirect || input.isMention
    ? { kind: "reply", text: SLACK_COPY.unlinked }
    : { kind: "drop" };
}
