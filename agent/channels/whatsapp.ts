import type { Message } from "chat";
import { chatSdkChannel, messageToUserContent } from "eve/channels/chat-sdk";
import { resolveChannelAuth } from "@/lib/channel-auth";
import { createChatState, createHarpyWhatsAppAdapter } from "@/lib/whatsapp/adapter";
import { getWhatsAppConfig } from "@/lib/whatsapp/config";
import { runInbound, toInboundMessage } from "@/lib/whatsapp/inbound";
import { formatWhatsAppReply } from "@/lib/whatsapp/reply";
import { handleIncomingAction } from "@/lib/whatsapp/review";
import { webhookResetter, wrapWhatsAppRoutes } from "@/lib/whatsapp/route";
import { handleStatuses } from "@/lib/whatsapp/statuses";

// WhatsApp through the Chat SDK adapter, served at /eve/v1/whatsapp. This file
// only wires things up: who gets a turn, what a tap does and how a reply looks
// are decided in lib/whatsapp.

const bridge = chatSdkChannel({
  userName: "harpy",
  adapters: { whatsapp: createHarpyWhatsAppAdapter() },
  state: createChatState(),
  // WhatsApp can't edit sent messages, so each reply is posted once, complete.
  streaming: false,
  // The default "drop" loses messages sent while an earlier one is handled.
  concurrency: "concurrent",
  turnPolicy: "steer",
  resolveInputAuth: (event) =>
    resolveChannelAuth({
      channel: "whatsapp",
      externalId: event.user.userId,
      extraAttributes: { waId: event.user.userId },
    }),
  events: {
    // Replaces eve's default post. Like the default, text the model writes
    // before a tool call is not sent.
    async "message.completed"(eventData, channel) {
      if (eventData.finishReason === "tool-calls" || !eventData.message || !channel.thread) return;
      const { text, imageUrls } = formatWhatsAppReply(eventData.message);
      if (!text && imageUrls.length === 0) return;
      await channel.thread.post({
        markdown: text,
        attachments: imageUrls.map((url) => ({
          type: "image" as const,
          url,
          mimeType: url.endsWith(".png") ? "image/png" : "image/jpeg",
        })),
      });
    },
  },
});

bridge.bot.onDirectMessage(async (thread, message) => {
  try {
    await runInbound(toInboundMessage(message), {
      startTurn: async (plan) => {
        // messageToUserContent reads only text, attachments and threadId.
        const content =
          plan.attachments.length === 0
            ? plan.text
            : messageToUserContent(
                Object.assign(Object.create(Object.getPrototypeOf(message)) as Message, message, {
                  text: plan.text,
                  attachments: [...plan.attachments],
                }),
              );
        await bridge.send(content, { thread, auth: plan.auth, idempotencyKey: message.id, context: plan.context });
      },
      resetSession: async () => (await webhookResetter.getStore()?.(thread.id)) ?? false,
    });
  } catch (error) {
    console.error("whatsapp: inbound failed", { messageId: message.id, error });
  }
});

// eve's own handler for its eve_input: buttons stays registered;
// handleIncomingAction ignores ids that aren't harpy's.
bridge.bot.onAction(async (event) => {
  const waId = event.user.userId;
  try {
    await handleIncomingAction({
      actionId: event.actionId,
      tapId: event.messageId,
      waId,
      phone: /^\d+$/.test(waId) ? waId : null,
    });
  } catch (error) {
    console.error("whatsapp: action failed", { actionId: event.actionId, tapId: event.messageId, error });
  }
});

const channel: typeof bridge.channel = {
  ...bridge.channel,
  routes: wrapWhatsAppRoutes(bridge.channel.routes, {
    appSecret: () => getWhatsAppConfig()?.appSecret ?? null,
    onStatuses: handleStatuses,
  }),
};

export default channel;
