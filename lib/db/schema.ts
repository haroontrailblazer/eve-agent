import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { ClientSessionState, MessageStreamEvent } from "eve/client";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const chat = pgTable(
  "chat",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default("New chat"),
    // Chats saved before eve 0.82 keep their events as read-only history; their
    // old session state cannot be resumed.
    legacy: boolean("legacy").notNull().default(false),
    eveSession: jsonb("eve_session").$type<ClientSessionState | null>(),
    pendingUserMessage: text("pending_user_message"),
    pendingUserMessageCreatedAt: timestamp("pending_user_message_created_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_user_updated").on(table.userId, table.updatedAt),
    index("idx_chat_user_created").on(table.userId, table.createdAt),
  ],
);

export const chatEvent = pgTable(
  "chat_event",
  {
    id: text("id").primaryKey(),
    chatId: text("chat_id")
      .notNull()
      .references(() => chat.id, { onDelete: "cascade" }),
    eventIndex: integer("event_index").notNull(),
    // eve's `meta.id` for the event; null for events that carry none.
    eveEventId: text("eve_event_id"),
    event: jsonb("event").$type<MessageStreamEvent>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("idx_chat_event_chat").on(table.chatId),
    uniqueIndex("idx_chat_event_chat_index").on(table.chatId, table.eventIndex),
    uniqueIndex("idx_chat_event_chat_eve_event").on(table.chatId, table.eveEventId),
  ],
);

export const mcpConnection = pgTable(
  "mcp_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    url: text("url"),
    token: text("token"),
    account: text("account"),
    enabled: boolean("enabled").notNull().default(true),
    // OAuth state for MCP servers that sign in via OAuth (dynamic client
    // registration + PKCE): { client, verifier, tokens }. oauthState holds the
    // pending flow's `state` so the callback can find this row.
    oauth: jsonb("oauth").$type<Record<string, unknown> | null>(),
    oauthState: text("oauth_state"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_mcp_user_platform").on(table.userId, table.platform)],
);

export const skill = pgTable(
  "skill",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // URL/command-safe identifier used as the "/slug" in the composer.
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    // The prompt template inserted into the composer (and used to guide the
    // agent) when the skill is invoked.
    prompt: text("prompt").notNull().default(""),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_skill_user_slug").on(table.userId, table.slug)],
);

export const generatedImage = pgTable(
  "generated_image",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull().default("image/png"),
    // Base64-encoded image bytes (no `data:` prefix). Served via /api/images/[id].
    data: text("data").notNull(),
    prompt: text("prompt").notNull().default(""),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("idx_generated_image_user").on(table.userId, table.createdAt)],
);

// One brand per owner. Every product table keys on brand_id; phase 1 creates
// the owner's brand on first use.
export const brand = pgTable(
  "brand",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("My brand"),
    timezone: text("timezone").notNull().default("UTC"),
    // Local time of day (HH:MM, in `timezone`) for the daily brief.
    briefLocalTime: text("brief_local_time").notNull().default("07:30"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("idx_brand_owner").on(table.ownerUserId)],
);

export const brandMember = pgTable(
  "brand_member",
  {
    id: text("id").primaryKey(),
    brandId: text("brand_id")
      .notNull()
      .references(() => brand.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"owner" | "member">().notNull().default("member"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_brand_member_brand_user").on(table.brandId, table.userId),
    index("idx_brand_member_user").on(table.userId),
  ],
);

// Links a sender on another channel (WhatsApp wa_id, Slack team:user) to a
// harpy user and brand, so every channel resolves to the same principal.
export const channelIdentity = pgTable(
  "channel_identity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    brandId: text("brand_id")
      .notNull()
      .references(() => brand.id, { onDelete: "cascade" }),
    channel: text("channel").notNull(),
    externalId: text("external_id").notNull(),
    phone: text("phone"),
    bsuid: text("bsuid"),
    linkedAt: timestamp("linked_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("idx_channel_identity_channel_external").on(table.channel, table.externalId),
    index("idx_channel_identity_user").on(table.userId),
  ],
);

export type Chat = typeof chat.$inferSelect;
export type ChatEvent = typeof chatEvent.$inferSelect;
export type User = typeof user.$inferSelect;
export type McpConnection = typeof mcpConnection.$inferSelect;
export type Skill = typeof skill.$inferSelect;
export type GeneratedImage = typeof generatedImage.$inferSelect;
export type Brand = typeof brand.$inferSelect;
export type BrandMember = typeof brandMember.$inferSelect;
export type ChannelIdentity = typeof channelIdentity.$inferSelect;
