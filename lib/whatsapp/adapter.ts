// The Chat SDK WhatsApp adapter and its state store. Both are safe to build
// with no env set, so imports and `eve build` never throw.

import { randomUUID } from "node:crypto";

import { createMemoryState } from "@chat-adapter/state-memory";
import { createRedisState } from "@chat-adapter/state-redis";
import { createWhatsAppAdapter, type WhatsAppAdapter } from "@chat-adapter/whatsapp";
import type { StateAdapter } from "chat";

import { getWhatsAppConfig } from "./config";

type Env = Readonly<Record<string, string | undefined>>;

// WhatsApp cannot edit or delete sent messages. eve's isNotImplemented checks
// the error's name or code, so these degrade gracefully instead of failing a turn.
function notImplemented(operation: string): Promise<never> {
  const error = new Error(`WhatsApp does not support ${operation}`);

  error.name = "NotImplementedError";
  Object.assign(error, { code: "NOT_IMPLEMENTED" });

  return Promise.reject(error);
}

export function createHarpyWhatsAppAdapter(env: Env = process.env): WhatsAppAdapter {
  const config = getWhatsAppConfig(env);
  // A random placeholder keeps an unconfigured webhook answering 401 or 403.
  const placeholder = () => `unconfigured-${randomUUID()}`;

  const adapter = createWhatsAppAdapter({
    accessToken: config?.accessToken ?? placeholder(),
    appSecret: config?.appSecret ?? placeholder(),
    phoneNumberId: config?.phoneNumberId ?? placeholder(),
    verifyToken: config?.verifyToken ?? placeholder(),
    userName: "harpy",
  });

  adapter.editMessage = () => notImplemented("editing messages");
  adapter.deleteMessage = () => notImplemented("deleting messages");

  return adapter;
}

export function createChatState(env: Env = process.env): StateAdapter {
  const url = env.REDIS_URL?.trim() || env.KV_URL?.trim();

  if (url && (url.startsWith("redis://") || url.startsWith("rediss://"))) {
    return createRedisState({ url, keyPrefix: "harpy-chat" });
  }

  return createMemoryState();
}
