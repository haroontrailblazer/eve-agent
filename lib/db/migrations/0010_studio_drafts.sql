CREATE TABLE "content_piece" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"body" jsonb NOT NULL,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft" (
	"id" text PRIMARY KEY NOT NULL,
	"idea_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"platform" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"hook" text DEFAULT '' NOT NULL,
	"text" text NOT NULL,
	"thread_parts" jsonb,
	"media_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"image_prompt" text,
	"scheduled_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_via" text,
	"published_at" timestamp with time zone,
	"external_post_id" text,
	"external_url" text,
	"error" text,
	"notes" text DEFAULT '' NOT NULL,
	"revision_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "draft_revision" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"revision" integer NOT NULL,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"thread_parts" jsonb,
	"instruction" text,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idea" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"created_by_user_id" text,
	"text" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_channel" text NOT NULL,
	"source_ref" text,
	"requested" jsonb NOT NULL,
	"draft_requested_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_example" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"platform" text,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_guide" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by_user_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_preference" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"text" text NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "content_piece" ADD CONSTRAINT "content_piece_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "content_piece" ADD CONSTRAINT "content_piece_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_idea_id_idea_id_fk" FOREIGN KEY ("idea_id") REFERENCES "public"."idea"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft" ADD CONSTRAINT "draft_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revision" ADD CONSTRAINT "draft_revision_draft_id_draft_id_fk" FOREIGN KEY ("draft_id") REFERENCES "public"."draft"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revision" ADD CONSTRAINT "draft_revision_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "draft_revision" ADD CONSTRAINT "draft_revision_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idea" ADD CONSTRAINT "idea_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_example" ADD CONSTRAINT "voice_example_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_guide" ADD CONSTRAINT "voice_guide_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_guide" ADD CONSTRAINT "voice_guide_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voice_preference" ADD CONSTRAINT "voice_preference_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_content_piece_idea_kind" ON "content_piece" USING btree ("idea_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_draft_idea_platform" ON "draft" USING btree ("idea_id","platform");--> statement-breakpoint
CREATE INDEX "idx_draft_brand_status" ON "draft" USING btree ("brand_id","status","scheduled_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_draft_revision_draft_revision" ON "draft_revision" USING btree ("draft_id","revision");--> statement-breakpoint
CREATE INDEX "idx_idea_brand_created" ON "idea" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_voice_example_brand_created" ON "voice_example" USING btree ("brand_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_voice_guide_brand_version" ON "voice_guide" USING btree ("brand_id","version");--> statement-breakpoint
CREATE INDEX "idx_voice_preference_brand" ON "voice_preference" USING btree ("brand_id","created_at");