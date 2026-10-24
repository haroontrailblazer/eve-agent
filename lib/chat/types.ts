import type { ClientSessionState, MessageStreamEvent } from "eve/client";

export type Viewer = {
  readonly email: string;
  readonly id: string;
  readonly image: string | null;
  readonly name: string;
};

export type ChatListItem = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

export type ChatListPage = {
  readonly items: readonly ChatListItem[];
  readonly nextCursor: string | null;
};

export type ActiveChat = {
  readonly events: readonly MessageStreamEvent[];
  readonly id: string;
  readonly legacy: boolean;
  // The index the next saved stream event takes: one past the highest saved
  // index, or 0 for a chat with no events.
  readonly nextEventIndex: number;
  readonly pendingUserMessage: string | null;
  readonly session: ClientSessionState | undefined;
  readonly title: string;
};

export type SetupStatus = {
  readonly appReady: boolean;
  readonly authReady: boolean;
  readonly databaseConfigured: boolean;
  readonly databaseReady: boolean;
  readonly databaseSchemaReady: boolean;
  // Vercel Blob is configured. Image generation and image uploads need it;
  // chat does not, so it never gates appReady.
  readonly mediaReady: boolean;
  readonly missing: readonly string[];
  readonly rateLimitReady: boolean;
  // SOCIAL_TOKEN_ENCRYPTION_KEY is a valid 32 byte base64 key, so MCP tokens
  // and OAuth state can be encrypted before they reach Postgres.
  readonly secretsReady: boolean;
};
