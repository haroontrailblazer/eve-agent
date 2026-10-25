import { isNotImplemented } from "eve/channels/chat-sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { createRedisState, createMemoryState } = vi.hoisted(() => ({
  createRedisState: vi.fn(() => ({ kind: "redis" })),
  createMemoryState: vi.fn(() => ({ kind: "memory" })),
}));

vi.mock("@chat-adapter/state-redis", () => ({ createRedisState }));
vi.mock("@chat-adapter/state-memory", () => ({ createMemoryState }));

import { createChatState, createHarpyWhatsAppAdapter } from "./adapter";

describe("createHarpyWhatsAppAdapter", () => {
  it("builds without any env and is named whatsapp", () => {
    const adapter = createHarpyWhatsAppAdapter({});

    expect(adapter.name).toBe("whatsapp");
  });

  it("rejects editMessage and deleteMessage as not implemented", async () => {
    const adapter = createHarpyWhatsAppAdapter({});

    const edit = await adapter
      .editMessage("whatsapp:1:2", "wamid.1", "hi")
      .catch((error: unknown) => error);
    const del = await adapter.deleteMessage("whatsapp:1:2", "wamid.1").catch((error: unknown) => error);

    expect(isNotImplemented(edit)).toBe(true);
    expect(isNotImplemented(del)).toBe(true);
  });
});

describe("createChatState", () => {
  beforeEach(() => {
    createRedisState.mockClear();
    createMemoryState.mockClear();
  });

  it("uses redis for REDIS_URL", () => {
    createChatState({ REDIS_URL: "rediss://default:x@host:6379" });

    expect(createRedisState).toHaveBeenCalledWith({
      url: "rediss://default:x@host:6379",
      keyPrefix: "harpy-chat",
    });
    expect(createMemoryState).not.toHaveBeenCalled();
  });

  it("falls back to KV_URL", () => {
    createChatState({ KV_URL: "redis://h:6379" });

    expect(createRedisState).toHaveBeenCalledWith({ url: "redis://h:6379", keyPrefix: "harpy-chat" });
  });

  it("uses memory for non-redis urls or none", () => {
    createChatState({ REDIS_URL: "https://x.upstash.io" });
    createChatState({});

    expect(createRedisState).not.toHaveBeenCalled();
    expect(createMemoryState).toHaveBeenCalledTimes(2);
  });
});
