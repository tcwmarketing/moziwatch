CREATE TABLE "location_source_tombstones" (
	"source" varchar(80) NOT NULL,
	"external_id" varchar(240) NOT NULL,
	"reason_code" varchar(80) NOT NULL,
	"rule_version" varchar(80) NOT NULL,
	"name" varchar(160) NOT NULL,
	"normalized_name" varchar(180) NOT NULL,
	"country" varchar(2),
	"region" varchar(100),
	"latitude" double precision,
	"longitude" double precision,
	"source_confidence" real,
	"primary_category" varchar(100),
	"source_release" text,
	"source_checksum" varchar(64),
	"first_rejected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_rejected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "location_source_tombstones_source_external_id_pk" PRIMARY KEY("source","external_id")
);
--> statement-breakpoint
CREATE INDEX "location_source_tombstones_reason_idx" ON "location_source_tombstones" USING btree ("reason_code");--> statement-breakpoint
CREATE INDEX "location_source_tombstones_name_idx" ON "location_source_tombstones" USING btree ("normalized_name");--> statement-breakpoint
ALTER TABLE "location_source_tombstones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
REVOKE ALL ON TABLE "location_source_tombstones" FROM anon, authenticated;--> statement-breakpoint
CREATE INDEX "campgrounds_verified_point_gist_idx"
  ON "campgrounds" USING gist ("point")
  WHERE "active" = true
    AND "operational_status" <> 'closed'
    AND "verification_status" <> 'unverified';--> statement-breakpoint
CREATE INDEX "campgrounds_verified_search_trgm_idx"
  ON "campgrounds" USING gin (
    (("name" || ' ' || "city" || ' ' || "region")) extensions.gin_trgm_ops
  )
  WHERE "active" = true
    AND "operational_status" <> 'closed'
    AND "verification_status" <> 'unverified';
