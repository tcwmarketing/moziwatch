CREATE TABLE "canonical_duplicate_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"left_campground_id" uuid NOT NULL,
	"right_campground_id" uuid NOT NULL,
	"suggested_survivor_id" uuid NOT NULL,
	"match_score" real NOT NULL,
	"recommendation" varchar(20) NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"distance_meters" real,
	"name_similarity" real NOT NULL,
	"website_match" boolean DEFAULT false NOT NULL,
	"phone_match" boolean DEFAULT false NOT NULL,
	"address_match" boolean DEFAULT false NOT NULL,
	"status" "location_merge_review_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"first_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ADD CONSTRAINT "canonical_duplicate_candidates_left_campground_id_campgrounds_id_fk" FOREIGN KEY ("left_campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ADD CONSTRAINT "canonical_duplicate_candidates_right_campground_id_campgrounds_id_fk" FOREIGN KEY ("right_campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ADD CONSTRAINT "canonical_duplicate_candidates_suggested_survivor_id_campgrounds_id_fk" FOREIGN KEY ("suggested_survivor_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ADD CONSTRAINT "canonical_duplicate_candidates_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "canonical_duplicate_candidate_pair_uidx" ON "canonical_duplicate_candidates" USING btree ("left_campground_id","right_campground_id");--> statement-breakpoint
CREATE INDEX "canonical_duplicate_candidates_queue_idx" ON "canonical_duplicate_candidates" USING btree ("status","match_score");--> statement-breakpoint
CREATE INDEX "canonical_duplicate_candidates_left_idx" ON "canonical_duplicate_candidates" USING btree ("left_campground_id");--> statement-breakpoint
CREATE INDEX "canonical_duplicate_candidates_right_idx" ON "canonical_duplicate_candidates" USING btree ("right_campground_id");--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ADD CONSTRAINT "canonical_duplicate_candidates_order_check" CHECK ("left_campground_id" < "right_campground_id");--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "canonical_duplicate_candidates" FROM anon, authenticated;
