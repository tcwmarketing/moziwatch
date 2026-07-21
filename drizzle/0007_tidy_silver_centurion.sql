CREATE TABLE "campground_forecast_evidence" (
	"forecast_id" uuid PRIMARY KEY NOT NULL,
	"model_config_version" varchar(100) NOT NULL,
	"weather_provider" varchar(80) NOT NULL,
	"weather_run_at" timestamp with time zone NOT NULL,
	"environmental_result" jsonb NOT NULL,
	"recent_report_result" jsonb NOT NULL,
	"historical_report_result" jsonb NOT NULL,
	"component_weights" jsonb NOT NULL,
	"final_result" jsonb NOT NULL,
	"confidence_reasons" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campground_weather_history_daily" (
	"campground_id" uuid NOT NULL,
	"observed_on" date NOT NULL,
	"provider" varchar(80) NOT NULL,
	"weather_run_at" timestamp with time zone NOT NULL,
	"variables" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campground_weather_history_daily_campground_id_observed_on_provider_pk" PRIMARY KEY("campground_id","observed_on","provider")
);
--> statement-breakpoint
ALTER TABLE "campground_habitat_profiles" ADD COLUMN "shoreline_water_edge_length_km" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campground_habitat_profiles" ADD COLUMN "floodplain_exposure" real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "campground_habitat_profiles" ADD COLUMN "data_coverage" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "forecast_runs" ADD COLUMN "is_production" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "forecast_runs" ADD COLUMN "deployment_mode" varchar(20) DEFAULT 'v2' NOT NULL;--> statement-breakpoint
ALTER TABLE "campground_forecast_evidence" ADD CONSTRAINT "campground_forecast_evidence_forecast_id_campground_forecasts_id_fk" FOREIGN KEY ("forecast_id") REFERENCES "public"."campground_forecasts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_weather_history_daily" ADD CONSTRAINT "campground_weather_history_daily_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campground_weather_history_date_idx" ON "campground_weather_history_daily" USING btree ("observed_on");--> statement-breakpoint
CREATE INDEX "reports_forecast_evidence_idx" ON "reports" USING btree ("campground_id","observed_on","submitted_at") WHERE "reports"."moderation_status" = 'published' AND "reports"."deleted_at" IS NULL;
--> statement-breakpoint
ALTER TABLE "campground_forecast_evidence" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "campground_weather_history_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "campground_forecast_evidence" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "campground_weather_history_daily" FROM anon, authenticated;
