UPDATE "campgrounds" AS campground
SET "verification_status" = 'source_verified',
  "updated_at" = now()
WHERE campground."verification_status" = 'unverified'
  AND EXISTS (
    SELECT 1
    FROM "location_source_records" AS source_record
    WHERE source_record."campground_id" = campground."id"
      AND source_record."import_status" = 'accepted'
      AND source_record."source_priority" >= 80
  );
