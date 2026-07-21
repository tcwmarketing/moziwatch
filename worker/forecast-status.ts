import { sqlClient } from "@/db";

try {
  const [runs, schedules, database] = await Promise.all([
    sqlClient`
      WITH recent_runs AS MATERIALIZED (
        SELECT fr.id, fm.version, fr.forecast_date, fr.status,
          fr.is_production, fr.deployment_mode, fr.created_at,
          fr.generated_at, fr.error
        FROM forecast_runs fr
        JOIN forecast_models fm ON fm.id = fr.model_id
        ORDER BY fr.created_at DESC
        LIMIT 6
      ), forecast_counts AS (
        SELECT run_id, count(*)::int AS rows,
          count(DISTINCT campground_id)::int AS campgrounds
        FROM campground_forecasts
        WHERE run_id IN (SELECT id FROM recent_runs)
        GROUP BY run_id
      ), raw_counts AS (
        SELECT run_id, count(*)::int AS shared_weather_targets
        FROM weather_observations
        WHERE run_id IN (SELECT id FROM recent_runs)
        GROUP BY run_id
      )
      SELECT rr.version, rr.forecast_date, rr.status::text,
        rr.is_production, rr.deployment_mode, rr.created_at, rr.generated_at,
        left(coalesce(rr.error, ''), 300) AS error,
        coalesce(fc.rows, 0) AS forecast_rows,
        coalesce(fc.campgrounds, 0) AS forecast_campgrounds,
        coalesce(rc.shared_weather_targets, 0) AS shared_weather_targets
      FROM recent_runs rr
      LEFT JOIN forecast_counts fc ON fc.run_id = rr.id
      LEFT JOIN raw_counts rc ON rc.run_id = rr.id
      ORDER BY rr.created_at DESC
    `,
    sqlClient`
      SELECT cadence::text, count(*)::int AS campgrounds,
        count(*) FILTER (WHERE next_refresh_at <= now())::int AS due,
        min(next_refresh_at) FILTER (WHERE next_refresh_at <= now()) AS oldest_due,
        max(last_forecast_at) AS latest_forecast
      FROM campground_forecast_schedules
      GROUP BY cadence
      ORDER BY cadence
    `,
    sqlClient`
      SELECT pg_size_pretty(pg_database_size(current_database())) AS size,
        current_setting('default_transaction_read_only') AS default_read_only,
        pg_is_in_recovery() AS in_recovery
    `,
  ]);
  console.log(
    JSON.stringify(
      { checkedAt: new Date().toISOString(), database, runs, schedules },
      null,
      2,
    ),
  );
} finally {
  await sqlClient.end();
}
