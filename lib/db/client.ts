import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "@/lib/db/schema";

let database: NeonHttpDatabase<typeof schema> | null = null;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb() {
  if (!database) {
    const url = process.env.DATABASE_URL?.trim();

    if (!url) {
      throw new Error("DATABASE_URL is required. Add Neon to this Vercel project first.");
    }

    database = drizzle({ client: neon(url), schema });
  }

  return database;
}

export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_, prop) {
    return (getDb() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// Tables the app cannot run without. A missing one means migrations have not
// been applied yet. It names every table the harpy-v2 migrations (0006 to 0010)
// create, so a new build deployed before migrating shows "Run database
// migrations" until all of them are in, and old chats never meet new code.
export const REQUIRED_TABLES = [
  "account",
  "brand",
  "brand_member",
  "channel_identity",
  "chat",
  "chat_event",
  "content_piece",
  "draft",
  "draft_revision",
  "idea",
  "media_asset",
  "notification",
  "session",
  "user",
  "verification",
  "voice_example",
  "voice_guide",
  "voice_preference",
  "wa_message_map",
] as const;

// Tables are never dropped at runtime, so once the schema is ready it stays
// ready and later calls skip the query. A false result is not memoized, so
// running migrations takes effect without a restart.
let schemaReady = false;

export async function isDatabaseSchemaReady() {
  if (schemaReady) {
    return true;
  }

  const url = process.env.DATABASE_URL?.trim();

  if (!url) {
    return false;
  }

  try {
    const sql = neon(url);
    // REQUIRED_TABLES is a fixed list of identifiers, so building the text is
    // safe. Each name is quoted because "user" is a reserved word.
    const checks = REQUIRED_TABLES.map(
      (table) => `to_regclass('public."${table}"') is not null`,
    ).join(" and ");
    const rows = (await sql.query(`select ${checks} as ready`)) as unknown as [
      { readonly ready: boolean },
    ];

    schemaReady = rows[0]?.ready === true;

    return schemaReady;
  } catch {
    return false;
  }
}
