CREATE TYPE "public"."contact_submission_status" AS ENUM('inbox', 'spam', 'archived');--> statement-breakpoint
ALTER TYPE "public"."moderation_status" ADD VALUE 'spam' BEFORE 'hidden';--> statement-breakpoint
CREATE TABLE "contact_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"email" varchar(254) NOT NULL,
	"subject" varchar(160) NOT NULL,
	"message" varchar(3000) NOT NULL,
	"status" "contact_submission_status" DEFAULT 'inbox' NOT NULL,
	"spam_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"ip_hash" text NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reports" ADD COLUMN "spam_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "session" ADD COLUMN "impersonated_by" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_city_region" varchar(120);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_city_country" varchar(2);--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_city_latitude" double precision;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_city_longitude" double precision;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "home_city_place_id" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "ban_expires" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD CONSTRAINT "contact_submissions_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contact_submissions_status_created_idx" ON "contact_submissions" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_ip_created_idx" ON "contact_submissions" USING btree ("ip_hash","created_at");--> statement-breakpoint
ALTER TABLE "contact_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "contact_submissions" FROM anon, authenticated;--> statement-breakpoint
UPDATE "user"
SET
	"banned" = true,
	"ban_reason" = COALESCE("ban_reason", 'Account disabled by an administrator')
WHERE "disabled_at" IS NOT NULL;
