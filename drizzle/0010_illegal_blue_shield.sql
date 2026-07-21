CREATE TYPE "public"."location_deletion_review_status" AS ENUM('pending', 'approved', 'dismissed');--> statement-breakpoint
CREATE TABLE "location_deletion_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campground_id" uuid NOT NULL,
	"confidence" real NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "location_deletion_review_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "location_deletion_candidates" ADD CONSTRAINT "location_deletion_candidates_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_deletion_candidates" ADD CONSTRAINT "location_deletion_candidates_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "location_deletion_candidate_campground_uidx" ON "location_deletion_candidates" USING btree ("campground_id");--> statement-breakpoint
CREATE INDEX "location_deletion_candidates_queue_idx" ON "location_deletion_candidates" USING btree ("status","confidence");--> statement-breakpoint
CREATE INDEX "location_deletion_candidates_reviewer_idx" ON "location_deletion_candidates" USING btree ("reviewer_id");--> statement-breakpoint
ALTER TABLE "location_deletion_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "location_deletion_candidates" FROM anon, authenticated;
