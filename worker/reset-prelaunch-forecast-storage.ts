import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import postgres from "postgres";

const apply = process.argv.includes("--apply");
const sqlClient = postgres(maintenanceDatabaseUrl(), {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  idle_timeout: 20,
});

type StorageRow = {
  database_size: string;
  default_read_only: string;
  in_recovery: boolean;
  weather_observations: string;
  weather_history: string;
  forecast_rows: string;
  forecast_evidence: string;
};

async function storageSnapshot(
  sql: ReturnType<typeof postgres>,
): Promise<StorageRow> {
  const rows = await sql<StorageRow[]>`
    SELECT
      pg_size_pretty(pg_database_size(current_database())) AS database_size,
      current_setting('default_transaction_read_only') AS default_read_only,
      pg_is_in_recovery() AS in_recovery,
      pg_size_pretty(pg_total_relation_size('campground_weather_observations')) AS weather_observations,
      pg_size_pretty(pg_total_relation_size('campground_weather_history_daily')) AS weather_history,
      pg_size_pretty(pg_total_relation_size('campground_forecasts')) AS forecast_rows,
      pg_size_pretty(pg_total_relation_size('campground_forecast_evidence')) AS forecast_evidence
  `;
  return rows[0];
}

const reserved = await sqlClient.reserve();

try {
  const before = await storageSnapshot(reserved);
  if (!apply) {
    console.log(
      JSON.stringify(
        {
          apply: false,
          before,
          action:
            "Reset only reproducible pre-launch daily forecast, weather-history, and weather-provenance rows. Monthly outlooks, models, habitat profiles, reports, campground records, users, and schedules are retained.",
          runWith: "--apply",
        },
        null,
        2,
      ),
    );
    process.exitCode = 2;
  } else {
    // Supabase documents this session override as the recovery path when a
    // project entered protective read-only mode because it exceeded storage.
    await reserved.unsafe(
      "SET SESSION CHARACTERISTICS AS TRANSACTION READ WRITE",
    );

    await reserved.unsafe(`
      TRUNCATE TABLE
        campground_forecast_evidence,
        campground_forecasts,
        campground_weather_observations,
        campground_weather_history_daily,
        weather_observations
    `);

    const removedRuns = await reserved<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM forecast_runs fr
        USING forecast_models fm
        WHERE fr.model_id = fm.id
          AND fm.model_kind <> 'campground-monthly-climatology-seasonal-beta'
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;

    await reserved.unsafe(
      "VACUUM (ANALYZE) campground_forecasts, campground_forecast_evidence, campground_weather_observations, campground_weather_history_daily, weather_observations, forecast_runs",
    );
    await reserved.unsafe("SET default_transaction_read_only = 'off'");

    const after = await storageSnapshot(reserved);
    console.log(
      JSON.stringify(
        {
          apply: true,
          before,
          after,
          deletedDailyForecastRuns: removedRuns[0]?.deleted || 0,
          retained:
            "Monthly outlooks, model definitions, habitat profiles, campground records, reports, users, and forecast schedules.",
        },
        null,
        2,
      ),
    );
  }
} finally {
  reserved.release();
  await sqlClient.end();
}
