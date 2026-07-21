CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions;--> statement-breakpoint
CREATE TYPE "public"."location_import_run_status" AS ENUM('running', 'completed', 'failed', 'partial');--> statement-breakpoint
CREATE TYPE "public"."location_merge_review_status" AS ENUM('pending', 'approved', 'rejected', 'separate');--> statement-breakpoint
CREATE TYPE "public"."location_operational_status" AS ENUM('active', 'seasonal', 'closed', 'review');--> statement-breakpoint
CREATE TYPE "public"."location_suggestion_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."location_type" AS ENUM('developed_campground', 'rv_park', 'backcountry_campground', 'group_campground', 'other_established_campground');--> statement-breakpoint
CREATE TYPE "public"."location_verification_status" AS ENUM('unverified', 'source_verified', 'owner_verified', 'manually_verified');--> statement-breakpoint
CREATE TABLE "location_aliases" (
	"slug" varchar(180) PRIMARY KEY NOT NULL,
	"campground_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(80) NOT NULL,
	"status" "location_import_run_status" DEFAULT 'running' NOT NULL,
	"dataset_version" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"records_downloaded" integer DEFAULT 0 NOT NULL,
	"records_inserted" integer DEFAULT 0 NOT NULL,
	"records_updated" integer DEFAULT 0 NOT NULL,
	"records_unchanged" integer DEFAULT 0 NOT NULL,
	"records_matched" integer DEFAULT 0 NOT NULL,
	"merge_candidates_created" integer DEFAULT 0 NOT NULL,
	"records_skipped" integer DEFAULT 0 NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"checkpoint" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"dry_run" boolean DEFAULT false NOT NULL,
	"options" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_merge_candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_record_id" uuid NOT NULL,
	"suggested_campground_id" uuid NOT NULL,
	"match_score" real NOT NULL,
	"reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"distance_meters" real,
	"name_similarity" real,
	"website_match" boolean DEFAULT false NOT NULL,
	"phone_match" boolean DEFAULT false NOT NULL,
	"status" "location_merge_review_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_source_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" varchar(80) NOT NULL,
	"external_id" varchar(240) NOT NULL,
	"campground_id" uuid,
	"source_url" text,
	"license" varchar(120) NOT NULL,
	"attribution" text NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"last_seen_at" timestamp with time zone NOT NULL,
	"consecutive_missing_count" integer DEFAULT 0 NOT NULL,
	"checksum" varchar(64) NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"normalized_payload" jsonb NOT NULL,
	"source_geometry" jsonb,
	"representative_point" geometry(point) NOT NULL,
	"source_priority" integer DEFAULT 50 NOT NULL,
	"import_run_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campground_id" uuid,
	"kind" varchar(40) NOT NULL,
	"name" varchar(160),
	"country" varchar(2),
	"region" varchar(100),
	"locality" varchar(100),
	"latitude" double precision,
	"longitude" double precision,
	"comment" varchar(1500) NOT NULL,
	"submitter_email" varchar(254),
	"status" "location_suggestion_status" DEFAULT 'pending' NOT NULL,
	"reviewer_id" text,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "normalized_name" varchar(180) DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "location_type" "location_type" DEFAULT 'developed_campground' NOT NULL;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "point" geometry(point) GENERATED ALWAYS AS (extensions.st_setsrid(extensions.st_makepoint("longitude", "latitude"), 4326)) STORED NOT NULL;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "source_geometry" jsonb;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "operator" text;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "phone" varchar(60);--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "reservation_url" text;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "operational_status" "location_operational_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "verification_status" "location_verification_status" DEFAULT 'unverified' NOT NULL;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "manual_locks" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "field_provenance" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
UPDATE "campgrounds"
SET "normalized_name" = trim(regexp_replace(regexp_replace(lower("name"), '(campground|camping|camp site|campsite)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'))
WHERE "normalized_name" = '';--> statement-breakpoint
ALTER TABLE "location_aliases" ADD CONSTRAINT "location_aliases_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_merge_candidates" ADD CONSTRAINT "location_merge_candidates_source_record_id_location_source_records_id_fk" FOREIGN KEY ("source_record_id") REFERENCES "public"."location_source_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_merge_candidates" ADD CONSTRAINT "location_merge_candidates_suggested_campground_id_campgrounds_id_fk" FOREIGN KEY ("suggested_campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_merge_candidates" ADD CONSTRAINT "location_merge_candidates_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD CONSTRAINT "location_source_records_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD CONSTRAINT "location_source_records_import_run_id_location_import_runs_id_fk" FOREIGN KEY ("import_run_id") REFERENCES "public"."location_import_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_suggestions" ADD CONSTRAINT "location_suggestions_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_suggestions" ADD CONSTRAINT "location_suggestions_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "location_aliases_campground_idx" ON "location_aliases" USING btree ("campground_id");--> statement-breakpoint
CREATE INDEX "location_import_runs_source_started_idx" ON "location_import_runs" USING btree ("source","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "location_merge_candidate_pair_uidx" ON "location_merge_candidates" USING btree ("source_record_id","suggested_campground_id");--> statement-breakpoint
CREATE INDEX "location_merge_candidates_status_idx" ON "location_merge_candidates" USING btree ("status","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "location_source_records_source_external_uidx" ON "location_source_records" USING btree ("source","external_id");--> statement-breakpoint
CREATE INDEX "location_source_records_campground_idx" ON "location_source_records" USING btree ("campground_id");--> statement-breakpoint
CREATE INDEX "location_source_records_run_idx" ON "location_source_records" USING btree ("import_run_id");--> statement-breakpoint
CREATE INDEX "location_source_records_source_seen_idx" ON "location_source_records" USING btree ("source","last_seen_at");--> statement-breakpoint
CREATE INDEX "location_source_records_point_gist_idx" ON "location_source_records" USING gist ("representative_point");--> statement-breakpoint
CREATE INDEX "location_suggestions_status_idx" ON "location_suggestions" USING btree ("status","created_at");--> statement-breakpoint
ALTER TABLE "campgrounds" ADD CONSTRAINT "campgrounds_parent_id_campgrounds_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."campgrounds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campgrounds_parent_idx" ON "campgrounds" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "campgrounds_country_region_idx" ON "campgrounds" USING btree ("country","region");--> statement-breakpoint
CREATE INDEX "campgrounds_normalized_name_trgm_idx" ON "campgrounds" USING gin ("normalized_name" extensions.gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "campgrounds_point_gist_idx" ON "campgrounds" USING gist ("point");
