-- These tables are accessed only through MoziWatch's server-side PostgreSQL
-- connection. They are not part of the public Supabase Data API surface.
ALTER TABLE "campground_forecasts" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campground_habitat_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "campground_weather_observations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "donations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "habitat_profile_versions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_aliases" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_import_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_merge_candidates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_source_records" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "location_suggestions" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE "campground_forecasts" FROM anon, authenticated;
REVOKE ALL ON TABLE "campground_habitat_profiles" FROM anon, authenticated;
REVOKE ALL ON TABLE "campground_weather_observations" FROM anon, authenticated;
REVOKE ALL ON TABLE "donations" FROM anon, authenticated;
REVOKE ALL ON TABLE "habitat_profile_versions" FROM anon, authenticated;
REVOKE ALL ON TABLE "location_aliases" FROM anon, authenticated;
REVOKE ALL ON TABLE "location_import_runs" FROM anon, authenticated;
REVOKE ALL ON TABLE "location_merge_candidates" FROM anon, authenticated;
REVOKE ALL ON TABLE "location_source_records" FROM anon, authenticated;
REVOKE ALL ON TABLE "location_suggestions" FROM anon, authenticated;
