CREATE INDEX "location_source_records_directory_capacity_idx"
ON "location_source_records" USING btree (
  "campground_id",
  (CASE "campsite_count_kind"
    WHEN 'official_total' THEN 3
    WHEN 'reservable_inventory' THEN 2
    ELSE 1
  END) DESC,
  "authoritative" DESC,
  "source_priority" DESC,
  "campsite_count_checked_at" DESC NULLS LAST,
  "campsite_count"
)
WHERE "campsite_count" IS NOT NULL AND "campground_id" IS NOT NULL;
