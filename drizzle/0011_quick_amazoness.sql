CREATE TYPE "public"."campsite_count_kind" AS ENUM('official_total', 'reservable_inventory', 'mapped_capacity');--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "campsite_count" integer;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "campsite_count_kind" "campsite_count_kind";--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "campsite_count_source_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "campsite_count_checked_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "location_source_records_capacity_idx" ON "location_source_records" USING btree ("campground_id","source_priority") WHERE "location_source_records"."campsite_count" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD CONSTRAINT "location_source_records_campsite_count_check" CHECK ("location_source_records"."campsite_count" IS NULL OR "location_source_records"."campsite_count" BETWEEN 1 AND 100000);