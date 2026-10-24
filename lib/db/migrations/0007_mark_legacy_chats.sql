-- Custom SQL migration file, put your code below! --
UPDATE "chat" SET "legacy" = true, "eve_session" = NULL, "pending_user_message" = NULL, "pending_user_message_created_at" = NULL
WHERE "eve_session" IS NOT NULL OR EXISTS (SELECT 1 FROM "chat_event" e WHERE e."chat_id" = "chat"."id");
