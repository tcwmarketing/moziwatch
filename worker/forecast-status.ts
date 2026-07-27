import { sqlClient } from "@/db";

try {
  const [runs, schedules, database, coverage] = await Promise.all([
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
    sqlClient`
      WITH capacity AS (
        SELECT DISTINCT ON (campground_id)
          campground_id, campsite_count
        FROM location_source_records
        WHERE campsite_count IS NOT NULL
        ORDER BY campground_id,
          CASE campsite_count_kind
            WHEN 'official_total' THEN 3
            WHEN 'reservable_inventory' THEN 2
            ELSE 1
          END DESC,
          authoritative DESC, source_priority DESC
      ), current_forecast AS (
        SELECT DISTINCT forecasts.campground_id
        FROM campground_forecasts forecasts
        JOIN forecast_runs runs ON runs.id = forecasts.run_id
        WHERE forecasts.target_date = CURRENT_DATE
          AND runs.status = 'published'
          AND runs.is_production = true
      )
      SELECT
        count(*)::int AS profiled_campgrounds,
        count(*) FILTER (
          WHERE current_forecast.campground_id IS NOT NULL
        )::int AS forecast_available,
        count(*) FILTER (
          WHERE coalesce(capacity.campsite_count, 0) >= 50
        )::int AS major_profiled,
        count(*) FILTER (
          WHERE coalesce(capacity.campsite_count, 0) >= 50
            AND current_forecast.campground_id IS NOT NULL
        )::int AS major_forecast_available,
        count(*) FILTER (
          WHERE coalesce(capacity.campsite_count, 0) < 50
        )::int AS minor_profiled,
        count(*) FILTER (
          WHERE coalesce(capacity.campsite_count, 0) < 50
            AND current_forecast.campground_id IS NOT NULL
        )::int AS minor_forecast_available
      FROM campgrounds campgrounds
      JOIN campground_habitat_profiles profiles
        ON profiles.campground_id = campgrounds.id
        AND profiles.active = true
      LEFT JOIN capacity ON capacity.campground_id = campgrounds.id
      LEFT JOIN current_forecast
        ON current_forecast.campground_id = campgrounds.id
      WHERE campgrounds.active = true
        AND campgrounds.country IN ('CA', 'US')
    `,
  ]);
  console.log(
    JSON.stringify(
      {
        checkedAt: new Date().toISOString(),
        database,
        coverage,
        runs,
        schedules,
      },
      null,
      2,
    ),
  );
} finally {
  await sqlClient.end();
}
