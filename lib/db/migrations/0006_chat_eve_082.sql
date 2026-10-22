ALTER TABLE "chat" ADD COLUMN "legacy" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_event" ADD COLUMN "eve_event_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_chat_event_chat_eve_event" ON "chat_event" USING btree ("chat_id","eve_event_id");