CREATE TABLE "notification" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"channel" text NOT NULL,
	"recipient" text NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"delivery" text,
	"provider_message_id" text,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wa_message_map" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"wamid" text NOT NULL,
	"draft_id" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"notification_id" text,
	"recipient" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification" ADD CONSTRAINT "notification_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_message_map" ADD CONSTRAINT "wa_message_map_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_message_map" ADD CONSTRAINT "wa_message_map_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wa_message_map" ADD CONSTRAINT "wa_message_map_notification_id_notification_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notification"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_notification_dedupe" ON "notification" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "idx_notification_brand_created" ON "notification" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_wa_message_map_wamid" ON "wa_message_map" USING btree ("wamid");--> statement-breakpoint
CREATE INDEX "idx_wa_message_map_draft" ON "wa_message_map" USING btree ("draft_id");