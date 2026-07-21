ALTER TABLE "reports" ADD COLUMN "observed_on" date;--> statement-breakpoint
UPDATE "reports" SET "observed_on" = ("submitted_at" AT TIME ZONE 'UTC')::date
WHERE "observed_on" IS NULL;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "observed_on" SET DEFAULT CURRENT_DATE;--> statement-breakpoint
ALTER TABLE "reports" ALTER COLUMN "observed_on" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "reports_campground_observed_idx" ON "reports" USING btree ("campground_id","observed_on");
