ALTER TABLE "account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_audit_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_aggregates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_forecast_evidence" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_forecast_interest_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_forecast_schedules" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_forecasts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_habitat_profiles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_imports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_monthly_outlooks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_weather_cache" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_weather_history_daily" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campground_weather_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "campgrounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "canonical_duplicate_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contact_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "donations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_job_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_models" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "forecast_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "habitat_profile_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_aliases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_deletion_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_import_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_merge_candidates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_source_providers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_source_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_source_tombstones" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "location_suggestions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "report_audit" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reports" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "saved_campgrounds" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "session" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "verification" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weather_observations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint

-- Better Auth and all application data access use the private PostgreSQL
-- connection. No application object belongs to the Supabase Data API.
-- Exclude extension-owned objects so PostGIS remains managed by its extension.
DO $$
DECLARE
  object record;
  api_role text;
BEGIN
  FOR object IN
    SELECT c.relname, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f', 'S')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_class'::regclass
          AND d.objid = c.oid AND d.deptype = 'e'
      )
  LOOP
    IF object.relkind IN ('r', 'p') THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', object.relname);
    END IF;
    EXECUTE format('REVOKE ALL ON %s public.%I FROM PUBLIC',
      CASE WHEN object.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
      object.relname);
    FOR api_role IN SELECT rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('REVOKE ALL ON %s public.%I FROM %I',
        CASE WHEN object.relkind = 'S' THEN 'SEQUENCE' ELSE 'TABLE' END,
        object.relname, api_role);
    END LOOP;
  END LOOP;

  FOR object IN
    SELECT p.oid::regprocedure AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind IN ('f', 'p')
      AND NOT EXISTS (
        SELECT 1 FROM pg_depend d
        WHERE d.classid = 'pg_proc'::regclass
          AND d.objid = p.oid AND d.deptype = 'e'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON ROUTINE %s FROM PUBLIC', object.signature);
    FOR api_role IN SELECT rolname FROM pg_roles
      WHERE rolname IN ('anon', 'authenticated', 'service_role')
    LOOP
      EXECUTE format('REVOKE ALL ON ROUTINE %s FROM %I', object.signature, api_role);
    END LOOP;
  END LOOP;

  -- Defaults are scoped to the migration creator. Supabase's internal roles
  -- and schemas are not changed. PUBLIC function EXECUTE is a global default,
  -- so PostgreSQL requires revoking that grant globally for this creator.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC;
  ALTER DEFAULT PRIVILEGES REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
  FOR api_role IN SELECT rolname FROM pg_roles
    WHERE rolname IN ('anon', 'authenticated', 'service_role')
  LOOP
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', api_role);
    EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM %I', api_role);
  END LOOP;
END;
$$;
