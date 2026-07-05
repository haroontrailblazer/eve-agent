CREATE TABLE "generated_image" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"media_type" text DEFAULT 'image/png' NOT NULL,
	"data" text NOT NULL,
	"prompt" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "generated_image" ADD CONSTRAINT "generated_image_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_generated_image_user" ON "generated_image" USING btree ("user_id","created_at");