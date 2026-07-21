import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import postgres from "postgres";

const sqlClient = postgres(maintenanceDatabaseUrl(), {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  idle_timeout: 20,
});

const vacuum = process.argv.includes("--vacuum");
const analyzeTables = [
  "campgrounds",
  "location_source_records",
  "location_source_tombstones",
  "canonical_duplicate_candidates",
  "location_merge_candidates",
  "location_deletion_candidates",
  "campground_habitat_profiles",
  "campground_forecast_schedules",
  "campground_aggregates",
  "campground_weather_history_daily",
  "campground_weather_observations",
  "weather_observations",
  "campground_forecasts",
  "campground_forecast_evidence",
  "campground_monthly_outlooks",
  "forecast_runs",
] as const;

const vacuumTables = new Set([
  "campground_weather_history_daily",
  "campground_weather_observations",
  "weather_observations",
  "campground_forecasts",
  "campground_forecast_evidence",
  "campground_monthly_outlooks",
  "forecast_runs",
]);

try {
  for (const table of analyzeTables) {
    const operation =
      vacuum && vacuumTables.has(table) ? "VACUUM (ANALYZE)" : "ANALYZE";
    await sqlClient.unsafe(`${operation} "${table}"`);
    console.log(`${operation} ${table} complete`);
  }
} finally {
  await sqlClient.end();
}
