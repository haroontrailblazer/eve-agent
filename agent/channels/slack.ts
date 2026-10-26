import { connectSlackCredentials } from "@vercel/connect/eve";
import {
  defaultSlackAuth,
  type SlackInboundMessageContext,
  type SlackMessage,
  slackChannel,
} from "eve/channels/slack";
import { decideSlackInbound, resolveSlackAuth } from "@/lib/slack-auth";

// SLACK_CONNECTOR is the UID returned by `vercel connect create slack`.
// For local setup, create a connector with:
// `vercel connect create slack --name eve-chat-template --triggers`.
const slackConnector = process.env.SLACK_CONNECTOR ?? "slack/eve-chat-template";

// Linked Slack users run as the owner principal; everyone else gets a hint in
// DMs and mentions, and silence elsewhere. Other channel messages count only
// in a thread harpy is already in. A failure drops the message.
async function admit(
  ctx: SlackInboundMessageContext,
  message: SlackMessage,
  kind: { readonly isDirect: boolean; readonly isMention: boolean; readonly isSubscribed?: boolean },
) {
  try {
    const decision = await decideSlackInbound({
      defaultAuth: defaultSlackAuth(message, ctx),
      text: message.text,
      ...kind,
    });

    if (decision.kind === "turn") {
      return { auth: decision.auth };
    }

    if (decision.kind === "reply") {
      await ctx.slack.request("chat.postMessage", {
        channel: ctx.slack.channelId,
        text: decision.text,
        thread_ts: ctx.slack.threadTs ?? undefined,
      });
    }
  } catch (error) {
    console.error("slack inbound failed", error);
  }

  return null;
}

export default slackChannel({
  credentials: connectSlackCredentials(slackConnector),
  uploadPolicy: "disabled",
  onDirectMessage: (ctx, message) => admit(ctx, message, { isDirect: true, isMention: false }),
  onAppMention: (ctx, message) => admit(ctx, message, { isDirect: false, isMention: true }),
  // eve keeps mentions of harpy out of onMessage (onAppMention takes them), so
  // this is a plain channel message.
  onMessage: async (ctx, message) =>
    admit(ctx, message, { isDirect: false, isMention: false, isSubscribed: await ctx.isSubscribed() }),
  // A resumed approval keeps the linked principal, not the raw Slack one.
  onInputResponse: async (ctx) => {
    const auth = await resolveSlackAuth(ctx.defaultAuth);

    return auth ? { auth } : null;
  },
});
