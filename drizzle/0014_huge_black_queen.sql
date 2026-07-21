CREATE TABLE "location_source_providers" (
	"source" varchar(80) PRIMARY KEY NOT NULL,
	"license" varchar(120) NOT NULL,
	"attribution" text NOT NULL,
	"default_priority" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
INSERT INTO "location_source_providers" (
	"source", "license", "attribution", "default_priority"
)
SELECT "source", max("license"), max("attribution"), max("source_priority")
FROM "location_source_records"
GROUP BY "source"
ON CONFLICT ("source") DO NOTHING;--> statement-breakpoint
ALTER TABLE "location_source_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "location_source_providers" FROM anon, authenticated;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "contact_emails" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD COLUMN "related_urls" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "location_source_records" ADD CONSTRAINT "location_source_records_source_location_source_providers_source_fk" FOREIGN KEY ("source") REFERENCES "public"."location_source_providers"("source") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campgrounds" DROP COLUMN "description";--> statement-breakpoint
ALTER TABLE "campgrounds" DROP COLUMN "data_license";--> statement-breakpoint
ALTER TABLE "location_source_records" DROP COLUMN "license";--> statement-breakpoint
ALTER TABLE "location_source_records" DROP COLUMN "attribution";--> statement-breakpoint
DROP INDEX IF EXISTS "campgrounds_location_gix";--> statement-breakpoint
ALTER TABLE "campgrounds" DROP COLUMN IF EXISTS "location";--> statement-breakpoint
UPDATE "campgrounds"
SET "source_geometry" = NULL
WHERE "source_geometry"->>'type' = 'Point';--> statement-breakpoint
UPDATE "campgrounds" campground
SET "field_provenance" = (
	SELECT coalesce(
		jsonb_object_agg(
			entry.key,
			CASE
				WHEN jsonb_typeof(entry.value) = 'array' THEN entry.value
				ELSE jsonb_build_array(
					entry.value->>'source',
					coalesce((entry.value->>'priority')::integer, 0)
				)
			END
		),
		'{}'::jsonb
	)
	FROM jsonb_each(campground."field_provenance") entry
)
WHERE EXISTS (
	SELECT 1 FROM jsonb_each(campground."field_provenance") entry
	WHERE jsonb_typeof(entry.value) <> 'array'
);
