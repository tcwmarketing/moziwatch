CREATE TYPE "public"."forecast_cadence" AS ENUM('daily', 'weekly', 'paused');--> statement-breakpoint
CREATE TABLE "campground_forecast_interest_daily" (
	"campground_id" uuid NOT NULL,
	"activity_date" timestamp with time zone NOT NULL,
	"detail_views" integer DEFAULT 0 NOT NULL,
	"forecast_requests" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campground_forecast_interest_daily_campground_id_activity_date_pk" PRIMARY KEY("campground_id","activity_date")
);
--> statement-breakpoint
CREATE TABLE "campground_forecast_schedules" (
	"campground_id" uuid PRIMARY KEY NOT NULL,
	"cadence" "forecast_cadence" DEFAULT 'paused' NOT NULL,
	"priority_score" integer DEFAULT 0 NOT NULL,
	"reason_codes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"next_refresh_at" timestamp with time zone,
	"last_requested_at" timestamp with time zone,
	"daily_until" timestamp with time zone,
	"manual_override" "forecast_cadence",
	"operating_status" varchar(30) DEFAULT 'active' NOT NULL,
	"last_forecast_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campground_monthly_outlooks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"campground_id" uuid NOT NULL,
	"habitat_profile_id" uuid NOT NULL,
	"target_month" timestamp with time zone NOT NULL,
	"score" real NOT NULL,
	"level" varchar(20) NOT NULL,
	"confidence" real NOT NULL,
	"factors" jsonb NOT NULL,
	"components" jsonb NOT NULL,
	"source_kind" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campground_forecast_interest_daily" ADD CONSTRAINT "campground_forecast_interest_daily_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_forecast_schedules" ADD CONSTRAINT "campground_forecast_schedules_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_monthly_outlooks" ADD CONSTRAINT "campground_monthly_outlooks_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_monthly_outlooks" ADD CONSTRAINT "campground_monthly_outlooks_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_monthly_outlooks" ADD CONSTRAINT "campground_monthly_outlooks_habitat_profile_id_campground_habitat_profiles_id_fk" FOREIGN KEY ("habitat_profile_id") REFERENCES "public"."campground_habitat_profiles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campground_forecast_interest_date_idx" ON "campground_forecast_interest_daily" USING btree ("activity_date");--> statement-breakpoint
CREATE INDEX "campground_forecast_schedule_due_idx" ON "campground_forecast_schedules" USING btree ("next_refresh_at") WHERE "campground_forecast_schedules"."cadence" <> 'paused';--> statement-breakpoint
CREATE INDEX "campground_forecast_schedule_cadence_idx" ON "campground_forecast_schedules" USING btree ("cadence");--> statement-breakpoint
CREATE UNIQUE INDEX "campground_monthly_outlook_run_month_uidx" ON "campground_monthly_outlooks" USING btree ("run_id","campground_id","target_month");--> statement-breakpoint
CREATE INDEX "campground_monthly_outlook_campground_month_idx" ON "campground_monthly_outlooks" USING btree ("campground_id","target_month");--> statement-breakpoint
CREATE INDEX "campground_monthly_outlook_profile_idx" ON "campground_monthly_outlooks" USING btree ("habitat_profile_id");
--> statement-breakpoint
ALTER TABLE "campground_monthly_outlooks"
  ADD CONSTRAINT "campground_monthly_outlook_score_check" CHECK ("score" >= 0 AND "score" <= 1),
  ADD CONSTRAINT "campground_monthly_outlook_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1),
  ADD CONSTRAINT "campground_monthly_outlook_month_check" CHECK ("target_month" = date_trunc('month', "target_month"));
--> statement-breakpoint
ALTER TABLE "campground_forecast_interest_daily" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "campground_forecast_schedules" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "campground_monthly_outlooks" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
REVOKE ALL ON TABLE "campground_forecast_interest_daily" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "campground_forecast_schedules" FROM anon, authenticated;
--> statement-breakpoint
REVOKE ALL ON TABLE "campground_monthly_outlooks" FROM anon, authenticated;
