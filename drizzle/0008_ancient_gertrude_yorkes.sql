ALTER TABLE "location_import_runs" ADD COLUMN "records_accepted" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "location_import_runs" ADD COLUMN "records_excluded" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "location_import_runs" ADD COLUMN "invalid_coordinates" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "location_import_runs" ADD COLUMN "duplicates_prevented" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "source_record_url" text;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "source_release" text;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "authoritative" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "import_status" varchar(40) DEFAULT 'accepted' NOT NULL;