import { sqlClient } from "@/db";

type Section = { name: string; data?: unknown; error?: string };

await sqlClient`SET statement_timeout = '30s'`;

function section<T>(name: string, query: () => Promise<T>) {
  return async (): Promise<Section> => {
    try {
      return { name, data: await query() };
    } catch (error) {
      return {
        name,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  };
}

const checks = [
  section(
    "campgrounds",
    () => sqlClient`
    WITH best_capacity AS (
      SELECT DISTINCT ON (campground_id) campground_id, campsite_count
      FROM location_source_records
      WHERE campground_id IS NOT NULL AND campsite_count IS NOT NULL
      ORDER BY campground_id,
        CASE campsite_count_kind
          WHEN 'official_total' THEN 3
          WHEN 'reservable_inventory' THEN 2
          ELSE 1
        END DESC,
        authoritative DESC, source_priority DESC,
        campsite_count_checked_at DESC NULLS LAST
    )
    SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE c.active)::int AS active,
      count(*) FILTER (WHERE c.active AND coalesce(cap.campsite_count, 0) >= 50)::int AS major,
      count(*) FILTER (WHERE c.active AND c.verification_status = 'unverified')::int AS unverified,
      count(*) FILTER (WHERE c.active AND c.operational_status = 'closed')::int AS closed,
      count(*) FILTER (WHERE c.active AND c.country IN ('CA', 'US'))::int AS north_america
    FROM campgrounds c
    LEFT JOIN best_capacity cap ON cap.campground_id = c.id
  `,
  ),
  section(
    "habitatCoverage",
    () => sqlClient`
    WITH eligible AS (
      SELECT id
      FROM campgrounds
      WHERE active = true AND country IN ('CA', 'US')
        AND latitude BETWEEN 14 AND 84 AND longitude BETWEEN -180 AND -52
    )
    SELECT
      (SELECT count(*)::int FROM eligible) AS eligible,
      count(DISTINCT hp.campground_id) FILTER (WHERE hp.active)::int AS active_profiles,
      count(DISTINCT hp.campground_id) FILTER (
        WHERE hp.active AND pv.version = 'habitat-north-america-v1'
      )::int AS current_version,
      count(DISTINCT hp.campground_id) FILTER (
        WHERE hp.active AND pv.data_kind = 'measured-geospatial'
      )::int AS measured,
      count(DISTINCT hp.campground_id) FILTER (
        WHERE hp.active AND pv.data_kind <> 'measured-geospatial'
      )::int AS provisional
    FROM eligible e
    LEFT JOIN campground_habitat_profiles hp ON hp.campground_id = e.id
    LEFT JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
  `,
  ),
  section(
    "habitatVersions",
    () => sqlClient`
    SELECT pv.version, pv.data_kind,
      count(hp.*)::int AS profiles,
      count(*) FILTER (WHERE hp.active)::int AS active_profiles,
      max(hp.calculated_at) AS newest_profile
    FROM habitat_profile_versions pv
    LEFT JOIN campground_habitat_profiles hp ON hp.profile_version_id = pv.id
    GROUP BY pv.id, pv.version, pv.data_kind
    ORDER BY pv.created_at DESC
  `,
  ),
  section(
    "habitatTierCoverage",
    () => sqlClient`
    WITH best_capacity AS (
      SELECT DISTINCT ON (campground_id) campground_id, campsite_count
      FROM location_source_records
      WHERE campground_id IS NOT NULL AND campsite_count IS NOT NULL
      ORDER BY campground_id,
        CASE campsite_count_kind
          WHEN 'official_total' THEN 3
          WHEN 'reservable_inventory' THEN 2
          ELSE 1
        END DESC,
        authoritative DESC, source_priority DESC,
        campsite_count_checked_at DESC NULLS LAST
    ), eligible AS (
      SELECT c.id,
        CASE WHEN coalesce(cap.campsite_count, 0) >= 50
          THEN 'major' ELSE 'verified_minor' END AS tier
      FROM campgrounds c
      LEFT JOIN best_capacity cap ON cap.campground_id = c.id
      WHERE c.active = true AND c.country IN ('CA', 'US')
        AND c.latitude BETWEEN 14 AND 84 AND c.longitude BETWEEN -180 AND -52
        AND (
          coalesce(cap.campsite_count, 0) >= 50
          OR (c.verification_status <> 'unverified' AND c.operational_status <> 'closed')
        )
    )
    SELECT e.tier, count(DISTINCT e.id)::int AS eligible,
      count(DISTINCT e.id) FILTER (WHERE hp.active)::int AS active_profile,
      count(DISTINCT e.id) FILTER (
        WHERE pv.version = CASE e.tier
          WHEN 'major' THEN 'habitat-north-america-v1'
          ELSE 'habitat-minor-fast-v1' END
      )::int AS preferred_version_any,
      count(DISTINCT e.id) FILTER (
        WHERE hp.active AND pv.version = CASE e.tier
          WHEN 'major' THEN 'habitat-north-america-v1'
          ELSE 'habitat-minor-fast-v1' END
      )::int AS preferred_version_active
    FROM eligible e
    LEFT JOIN campground_habitat_profiles hp ON hp.campground_id = e.id
    LEFT JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
    GROUP BY e.tier
    ORDER BY e.tier
  `,
  ),
  section(
    "forecastSchedules",
    () => sqlClient`
    SELECT cadence::text, count(*)::int AS campgrounds,
      count(*) FILTER (WHERE next_refresh_at <= now())::int AS due,
      min(next_refresh_at) AS oldest_due,
      max(last_forecast_at) AS latest_forecast
    FROM campground_forecast_schedules
    GROUP BY cadence
    ORDER BY cadence
  `,
  ),
  section(
    "forecastRuns",
    () => sqlClient`
    WITH recent_runs AS MATERIALIZED (
      SELECT fr.*, fm.version
      FROM forecast_runs fr
      JOIN forecast_models fm ON fm.id = fr.model_id
      ORDER BY fr.created_at DESC
      LIMIT 12
    ), counts AS (
      SELECT run_id, count(*)::int AS forecast_rows,
        count(DISTINCT campground_id)::int AS forecast_campgrounds
      FROM campground_forecasts
      WHERE run_id IN (SELECT id FROM recent_runs)
      GROUP BY run_id
    )
    SELECT rr.version, rr.forecast_date, rr.status::text, rr.is_production,
      rr.deployment_mode, rr.generated_at, rr.created_at,
      left(coalesce(rr.error, ''), 300) AS error,
      coalesce(counts.forecast_rows, 0) AS forecast_rows,
      coalesce(counts.forecast_campgrounds, 0) AS forecast_campgrounds
    FROM recent_runs rr
    LEFT JOIN counts ON counts.run_id = rr.id
    ORDER BY rr.created_at DESC
  `,
  ),
  section(
    "currentForecastCoverage",
    () => sqlClient`
    WITH recent_published AS MATERIALIZED (
      SELECT fr.*, fm.version
      FROM forecast_runs fr
      JOIN forecast_models fm ON fm.id = fr.model_id
      WHERE fr.status = 'published'
      ORDER BY fr.forecast_date DESC, fr.is_production DESC
      LIMIT 6
    )
    SELECT rp.version, rp.forecast_date, rp.is_production,
      count(DISTINCT cf.campground_id)::int AS campgrounds,
      count(cf.*)::int AS forecast_rows,
      min(cf.target_date) AS first_target,
      max(cf.target_date) AS last_target
    FROM recent_published rp
    JOIN campground_forecasts cf ON cf.run_id = rp.id
    GROUP BY rp.id, rp.version, rp.forecast_date, rp.is_production
    ORDER BY rp.forecast_date DESC, rp.is_production DESC
  `,
  ),
  section(
    "weatherStorage",
    () => sqlClient`
    SELECT
      (SELECT count(*)::int FROM campground_weather_cache) AS detail_cache_rows,
      (SELECT count(*)::int FROM campground_weather_cache WHERE expires_at > now()) AS live_detail_cache_rows,
      (SELECT max(fetched_at) FROM campground_weather_cache) AS latest_detail_fetch,
      (SELECT count(*)::int FROM campground_weather_history_daily) AS history_rows,
      (SELECT count(DISTINCT campground_id)::int FROM campground_weather_history_daily) AS history_campgrounds,
      (SELECT min(observed_on) FROM campground_weather_history_daily) AS earliest_history,
      (SELECT max(observed_on) FROM campground_weather_history_daily) AS latest_history
  `,
  ),
  section(
    "monthlyOutlooks",
    () => sqlClient`
    SELECT count(*)::int AS rows,
      count(DISTINCT campground_id)::int AS campgrounds,
      min(target_month) AS earliest_target,
      max(target_month) AS latest_target,
      max(created_at) AS latest_run
    FROM campground_monthly_outlooks
  `,
  ),
  section(
    "locationQueues",
    () => sqlClient`
    SELECT
      (SELECT count(*)::int FROM canonical_duplicate_candidates WHERE status = 'pending') AS duplicate_review,
      (SELECT count(*)::int FROM canonical_duplicate_candidates WHERE status = 'pending' AND recommendation = 'automatic') AS duplicate_automatic,
      (SELECT count(*)::int FROM location_merge_candidates WHERE status = 'pending') AS source_match_review,
      (SELECT count(*)::int FROM location_deletion_candidates WHERE status = 'pending') AS deletion_review,
      (SELECT count(*)::int FROM location_suggestions WHERE status = 'pending') AS suggestions
  `,
  ),
  section(
    "locationImports",
    () => sqlClient`
    SELECT source, status::text, started_at, completed_at,
      records_downloaded, records_accepted, records_inserted, records_updated,
      records_skipped, jsonb_array_length(errors) AS error_count
    FROM location_import_runs
    ORDER BY started_at DESC
    LIMIT 15
  `,
  ),
  section(
    "databaseSize",
    () => sqlClient`
    SELECT pg_size_pretty(pg_database_size(current_database())) AS database_size,
      current_setting('default_transaction_read_only') AS default_read_only,
      pg_is_in_recovery() AS in_recovery
  `,
  ),
  section(
    "largestTables",
    () => sqlClient`
    SELECT relname AS table_name,
      pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
      pg_total_relation_size(relid)::bigint AS total_bytes,
      n_live_tup::bigint AS estimated_live_rows,
      n_dead_tup::bigint AS estimated_dead_rows,
      last_analyze, last_autoanalyze, last_autovacuum
    FROM pg_stat_user_tables
    ORDER BY pg_total_relation_size(relid) DESC
    LIMIT 20
  `,
  ),
  section(
    "databaseActivity",
    () => sqlClient`
    SELECT state, count(*)::int AS connections,
      max(now() - query_start) FILTER (WHERE state <> 'idle') AS longest_active
    FROM pg_stat_activity
    WHERE datname = current_database() AND pid <> pg_backend_pid()
    GROUP BY state
    ORDER BY state
  `,
  ),
  section(
    "extensions",
    () => sqlClient`
    SELECT extname, extversion
    FROM pg_extension
    WHERE extname IN ('postgis', 'pg_trgm', 'pg_cron')
    ORDER BY extname
  `,
  ),
  section(
    "rowLevelSecurity",
    () => sqlClient`
    SELECT count(*)::int AS application_tables,
      count(*) FILTER (WHERE tables.relrowsecurity)::int AS rls_enabled,
      coalesce(
        jsonb_agg(tables.relname ORDER BY tables.relname)
          FILTER (WHERE NOT tables.relrowsecurity),
        '[]'::jsonb
      ) AS missing_rls
    FROM pg_class tables
    JOIN pg_namespace namespaces ON namespaces.oid = tables.relnamespace
    LEFT JOIN pg_depend dependencies
      ON dependencies.objid = tables.oid AND dependencies.deptype = 'e'
    WHERE namespaces.nspname = 'public'
      AND tables.relkind IN ('r', 'p')
      AND dependencies.objid IS NULL
  `,
  ),
  section(
    "dataApiTableGrants",
    () => sqlClient`
    SELECT grantee, table_name,
      array_agg(privilege_type ORDER BY privilege_type) AS privileges
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND grantee IN ('anon', 'authenticated')
    GROUP BY grantee, table_name
    ORDER BY grantee, table_name
  `,
  ),
  section("cronJobs", async () => {
    const exists = await sqlClient<{ exists: boolean }[]>`
      SELECT to_regclass('cron.job') IS NOT NULL AS exists
    `;
    if (!exists[0]?.exists) return [];
    return sqlClient`
      SELECT jobid, schedule, command, active, database, username
      FROM cron.job
      ORDER BY jobid
    `;
  }),
];

const sections: Section[] = [];
for (const check of checks) {
  const result = await check();
  sections.push(result);
  console.error(
    `Prelaunch audit: ${result.name}${result.error ? " failed" : " complete"}`,
  );
}

console.log(
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      sections,
    },
    null,
    2,
  ),
);

const rls = sections.find((item) => item.name === "rowLevelSecurity")?.data as
  Array<{ missing_rls?: unknown[] }> | undefined;
const dataApiGrants = sections.find(
  (item) => item.name === "dataApiTableGrants",
)?.data as unknown[] | undefined;
if (
  (rls?.[0]?.missing_rls?.length || 0) > 0 ||
  (dataApiGrants?.length || 0) > 0
) {
  console.error(
    "Prelaunch audit failed: one or more application tables remain exposed through the Supabase Data API.",
  );
  process.exitCode = 1;
}

await sqlClient.end();
