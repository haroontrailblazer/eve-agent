CREATE TABLE "brand" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_user_id" text NOT NULL,
	"name" text DEFAULT 'My brand' NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"brief_local_time" text DEFAULT '07:30' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "brand_member" (
	"id" text PRIMARY KEY NOT NULL,
	"brand_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_identity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"brand_id" text NOT NULL,
	"channel" text NOT NULL,
	"external_id" text NOT NULL,
	"phone" text,
	"bsuid" text,
	"linked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand" ADD CONSTRAINT "brand_owner_user_id_user_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_member" ADD CONSTRAINT "brand_member_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "brand_member" ADD CONSTRAINT "brand_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identity" ADD CONSTRAINT "channel_identity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_identity" ADD CONSTRAINT "channel_identity_brand_id_brand_id_fk" FOREIGN KEY ("brand_id") REFERENCES "public"."brand"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_brand_owner" ON "brand" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_brand_member_brand_user" ON "brand_member" USING btree ("brand_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_brand_member_user" ON "brand_member" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_channel_identity_channel_external" ON "channel_identity" USING btree ("channel","external_id");--> statement-breakpoint
CREATE INDEX "idx_channel_identity_user" ON "channel_identity" USING btree ("user_id");