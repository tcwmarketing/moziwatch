ALTER TABLE "contact_submissions" ADD COLUMN "email_hash" text;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "content_fingerprint" varchar(16);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "form_proof_valid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_provider" varchar(40) DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_assessment_id" text;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_score" real;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_action" varchar(80);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_hostname" varchar(253);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_invalid_reason" varchar(80);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_annotation" varchar(20);--> statement-breakpoint
ALTER TABLE "contact_submissions" ADD COLUMN "bot_annotated_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "contact_submissions_email_created_idx" ON "contact_submissions" USING btree ("email_hash","created_at");--> statement-breakpoint
CREATE INDEX "contact_submissions_fingerprint_created_idx" ON "contact_submissions" USING btree ("content_fingerprint","created_at");