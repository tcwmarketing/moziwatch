CREATE TABLE "campground_forecasts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"campground_id" uuid NOT NULL,
	"habitat_profile_id" uuid NOT NULL,
	"target_date" timestamp with time zone NOT NULL,
	"day_offset" integer NOT NULL,
	"score" real NOT NULL,
	"level" varchar(20) NOT NULL,
	"confidence" real NOT NULL,
	"factors" jsonb NOT NULL,
	"components" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campground_habitat_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campground_id" uuid NOT NULL,
	"profile_version_id" uuid NOT NULL,
	"wetland_coverage" jsonb NOT NULL,
	"marsh_coverage" jsonb NOT NULL,
	"seasonal_water_coverage" jsonb NOT NULL,
	"forest_coverage" jsonb NOT NULL,
	"small_water_body_density" real NOT NULL,
	"stagnant_water_potential" real NOT NULL,
	"lake_shoreline_proximity" real NOT NULL,
	"large_open_water_coverage" real NOT NULL,
	"fast_river_proximity" real NOT NULL,
	"slow_river_proximity" real NOT NULL,
	"vegetation_coverage" real NOT NULL,
	"elevation_m" real NOT NULL,
	"slope_degrees" real NOT NULL,
	"drainage_potential" real NOT NULL,
	"annual_rainfall_mm" real NOT NULL,
	"warm_season_rainfall_mm" real NOT NULL,
	"land_cover_type" varchar(80) NOT NULL,
	"profile_confidence" real NOT NULL,
	"archetype" varchar(80),
	"source_provenance" jsonb NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campground_weather_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"campground_id" uuid NOT NULL,
	"observed_for" timestamp with time zone NOT NULL,
	"provider" varchar(80) NOT NULL,
	"variables" jsonb NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habitat_profile_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(80) NOT NULL,
	"data_kind" varchar(40) NOT NULL,
	"source_manifest" jsonb NOT NULL,
	"method_notes" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "habitat_profile_versions_version_unique" UNIQUE("version")
);
--> statement-breakpoint
ALTER TABLE "campground_forecasts" ADD CONSTRAINT "campground_forecasts_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_forecasts" ADD CONSTRAINT "campground_forecasts_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_forecasts" ADD CONSTRAINT "campground_forecasts_habitat_profile_id_campground_habitat_profiles_id_fk" FOREIGN KEY ("habitat_profile_id") REFERENCES "public"."campground_habitat_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_habitat_profiles" ADD CONSTRAINT "campground_habitat_profiles_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_habitat_profiles" ADD CONSTRAINT "campground_habitat_profiles_profile_version_id_habitat_profile_versions_id_fk" FOREIGN KEY ("profile_version_id") REFERENCES "public"."habitat_profile_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_weather_observations" ADD CONSTRAINT "campground_weather_observations_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_weather_observations" ADD CONSTRAINT "campground_weather_observations_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "campground_forecast_run_date_uidx" ON "campground_forecasts" USING btree ("run_id","campground_id","target_date");--> statement-breakpoint
CREATE INDEX "campground_forecast_campground_date_idx" ON "campground_forecasts" USING btree ("campground_id","target_date");--> statement-breakpoint
CREATE INDEX "campground_forecast_run_offset_idx" ON "campground_forecasts" USING btree ("run_id","day_offset");--> statement-breakpoint
CREATE INDEX "campground_forecast_profile_idx" ON "campground_forecasts" USING btree ("habitat_profile_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campground_habitat_profile_version_uidx" ON "campground_habitat_profiles" USING btree ("campground_id","profile_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campground_habitat_active_uidx" ON "campground_habitat_profiles" USING btree ("campground_id") WHERE "campground_habitat_profiles"."active" = true;--> statement-breakpoint
CREATE INDEX "campground_habitat_version_idx" ON "campground_habitat_profiles" USING btree ("profile_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campground_weather_run_date_uidx" ON "campground_weather_observations" USING btree ("run_id","campground_id","observed_for");--> statement-breakpoint
CREATE INDEX "campground_weather_campground_date_idx" ON "campground_weather_observations" USING btree ("campground_id","observed_for");