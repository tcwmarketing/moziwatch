CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;--> statement-breakpoint
CREATE TYPE "public"."forecast_run_status" AS ENUM('queued', 'running', 'published', 'failed');--> statement-breakpoint
CREATE TYPE "public"."import_status" AS ENUM('preview', 'committed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."moderation_status" AS ENUM('pending', 'published', 'hidden', 'rejected', 'deleted');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('member', 'admin');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(80) NOT NULL,
	"target_id" text,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campground_aggregates" (
	"campground_id" uuid PRIMARY KEY NOT NULL,
	"recent_average" real,
	"recent_count" integer DEFAULT 0 NOT NULL,
	"historical_average" real,
	"historical_count" integer DEFAULT 0 NOT NULL,
	"most_recent_report_at" timestamp with time zone,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campground_imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text NOT NULL,
	"status" "import_status" DEFAULT 'preview' NOT NULL,
	"filename" text NOT NULL,
	"summary" jsonb NOT NULL,
	"rows" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"committed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "campgrounds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(160) NOT NULL,
	"slug" varchar(180) NOT NULL,
	"address" varchar(220) NOT NULL,
	"city" varchar(100) NOT NULL,
	"region" varchar(100) NOT NULL,
	"country" varchar(2) NOT NULL,
	"postal_code" varchar(20) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"website" text,
	"description" text,
	"data_source" text DEFAULT 'development-seed' NOT NULL,
	"data_license" text DEFAULT 'development-only' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campgrounds_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "forecast_cells" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"cell_key" varchar(80) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"score" real NOT NULL,
	"cell_geojson" jsonb NOT NULL,
	"features" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_job_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid,
	"level" varchar(20) NOT NULL,
	"message" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "forecast_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"version" varchar(80) NOT NULL,
	"model_kind" varchar(80) NOT NULL,
	"artifact" jsonb NOT NULL,
	"evaluation" jsonb NOT NULL,
	"model_created_at" timestamp with time zone NOT NULL,
	"active" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "forecast_models_version_unique" UNIQUE("version")
);
--> statement-breakpoint
CREATE TABLE "forecast_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" uuid NOT NULL,
	"forecast_date" timestamp with time zone NOT NULL,
	"generated_at" timestamp with time zone,
	"status" "forecast_run_status" DEFAULT 'queued' NOT NULL,
	"source" varchar(80) DEFAULT 'open-meteo' NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_audit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"report_id" uuid NOT NULL,
	"actor_id" text,
	"action" varchar(80) NOT NULL,
	"previous_status" "moderation_status",
	"next_status" "moderation_status",
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campground_id" uuid NOT NULL,
	"rating" integer NOT NULL,
	"comment" varchar(800),
	"account_id" text,
	"anonymous_token_hash" text,
	"ip_hash" text NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"moderation_status" "moderation_status" DEFAULT 'published' NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "saved_campgrounds" (
	"account_id" text NOT NULL,
	"campground_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saved_campgrounds_account_id_campground_id_pk" PRIMARY KEY("account_id","campground_id")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"disabled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weather_observations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"cell_key" varchar(80) NOT NULL,
	"latitude" double precision NOT NULL,
	"longitude" double precision NOT NULL,
	"observed_for" timestamp with time zone NOT NULL,
	"provider" varchar(80) NOT NULL,
	"variables" jsonb NOT NULL,
	"raw_payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ADD CONSTRAINT "admin_audit_logs_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_aggregates" ADD CONSTRAINT "campground_aggregates_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campground_imports" ADD CONSTRAINT "campground_imports_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_cells" ADD CONSTRAINT "forecast_cells_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_job_logs" ADD CONSTRAINT "forecast_job_logs_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "forecast_runs" ADD CONSTRAINT "forecast_runs_model_id_forecast_models_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."forecast_models"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit" ADD CONSTRAINT "report_audit_report_id_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_audit" ADD CONSTRAINT "report_audit_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_campgrounds" ADD CONSTRAINT "saved_campgrounds_account_id_user_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "saved_campgrounds" ADD CONSTRAINT "saved_campgrounds_campground_id_campgrounds_id_fk" FOREIGN KEY ("campground_id") REFERENCES "public"."campgrounds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weather_observations" ADD CONSTRAINT "weather_observations_run_id_forecast_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."forecast_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_provider_account_uidx" ON "account" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "account_user_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "campgrounds_active_idx" ON "campgrounds" USING btree ("active");--> statement-breakpoint
CREATE INDEX "campgrounds_name_idx" ON "campgrounds" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_cell_run_key_uidx" ON "forecast_cells" USING btree ("run_id","cell_key");--> statement-breakpoint
CREATE INDEX "forecast_cell_run_idx" ON "forecast_cells" USING btree ("run_id");--> statement-breakpoint
CREATE UNIQUE INDEX "forecast_run_model_date_uidx" ON "forecast_runs" USING btree ("model_id","forecast_date");--> statement-breakpoint
CREATE INDEX "reports_campground_date_idx" ON "reports" USING btree ("campground_id","submitted_at");--> statement-breakpoint
CREATE INDEX "reports_account_idx" ON "reports" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "reports_anonymous_idx" ON "reports" USING btree ("anonymous_token_hash");--> statement-breakpoint
CREATE INDEX "reports_ip_idx" ON "reports" USING btree ("ip_hash");--> statement-breakpoint
CREATE INDEX "reports_moderation_idx" ON "reports" USING btree ("moderation_status");--> statement-breakpoint
CREATE INDEX "session_user_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE UNIQUE INDEX "weather_run_cell_uidx" ON "weather_observations" USING btree ("run_id","cell_key");
--> statement-breakpoint
ALTER TABLE "campgrounds" ADD COLUMN "location" extensions.geography(Point, 4326) GENERATED ALWAYS AS (extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography) STORED;
--> statement-breakpoint
CREATE INDEX "campgrounds_location_gix" ON "campgrounds" USING gist ("location");
--> statement-breakpoint
ALTER TABLE "forecast_cells" ADD COLUMN "location" extensions.geography(Point, 4326) GENERATED ALWAYS AS (extensions.ST_SetSRID(extensions.ST_MakePoint(longitude, latitude), 4326)::extensions.geography) STORED;
--> statement-breakpoint
CREATE INDEX "forecast_cells_location_gix" ON "forecast_cells" USING gist ("location");
--> statement-breakpoint
ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "admin_audit_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campground_aggregates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campground_imports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campgrounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_cells" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_job_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_models" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "forecast_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "report_audit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "saved_campgrounds" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weather_observations" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
