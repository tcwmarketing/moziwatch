import { sqlClient } from "@/db";

try {
  const latestRuns = await sqlClient<
    Array<{
      version: string;
      status: string;
      is_production: boolean;
      deployment_mode: string;
      generated_at: string | null;
      error: string | null;
    }>
  >`
    SELECT DISTINCT ON (m.version) m.version, r.status, r.is_production,
      r.deployment_mode, r.generated_at::text, r.error
    FROM forecast_runs r JOIN forecast_models m ON m.id = r.model_id
    WHERE m.version IN ('mosquito-campground-beta-v2', 'mosquito-campground-v3')
    ORDER BY m.version, r.forecast_date DESC, r.created_at DESC
  `;
  const rows = await sqlClient<
    Array<{
      campground_count: number;
      forecast_count: number;
      mean_absolute_delta: number;
      mean_v2: number;
      mean_v3: number;
    }>
  >`
    WITH latest AS (
      SELECT m.version, r.id,
        row_number() OVER (PARTITION BY m.version ORDER BY r.generated_at DESC) AS position
      FROM forecast_runs r
      JOIN forecast_models m ON m.id = r.model_id
      WHERE r.status = 'published'
        AND m.version IN ('mosquito-campground-beta-v2', 'mosquito-campground-v3')
    ), v2 AS (
      SELECT f.campground_id, f.target_date::date AS target_date, f.score
      FROM campground_forecasts f JOIN latest ON latest.id = f.run_id
      WHERE latest.version = 'mosquito-campground-beta-v2' AND latest.position = 1
    ), v3 AS (
      SELECT f.campground_id, f.target_date::date AS target_date, f.score
      FROM campground_forecasts f JOIN latest ON latest.id = f.run_id
      WHERE latest.version = 'mosquito-campground-v3' AND latest.position = 1
    )
    SELECT count(DISTINCT v2.campground_id)::int AS campground_count,
      count(*)::int AS forecast_count,
      coalesce(avg(abs(v3.score - v2.score)), 0)::real AS mean_absolute_delta,
      coalesce(avg(v2.score), 0)::real AS mean_v2,
      coalesce(avg(v3.score), 0)::real AS mean_v3
    FROM v2 JOIN v3 USING (campground_id, target_date)
  `;
  const evidence = await sqlClient<
    Array<{
      environmental_risk: number;
      habitat: number;
      breeding: number;
      population: number;
      activity: number;
    }>
  >`
    SELECT
      coalesce(avg((e.environmental_result->>'riskIndex')::real), 0)::real AS environmental_risk,
      coalesce(avg((e.environmental_result->>'habitatSuitability')::real), 0)::real AS habitat,
      coalesce(avg((e.environmental_result->>'breedingCondition')::real), 0)::real AS breeding,
      coalesce(avg((e.environmental_result->>'populationPotential')::real), 0)::real AS population,
      coalesce(avg((e.environmental_result->>'activityModifier')::real), 0)::real AS activity
    FROM campground_forecast_evidence e
    JOIN campground_forecasts f ON f.id = e.forecast_id
    JOIN forecast_runs r ON r.id = f.run_id
    JOIN forecast_models m ON m.id = r.model_id
    WHERE m.version = 'mosquito-campground-v3' AND r.status = 'published'
      AND r.id = (
        SELECT r2.id FROM forecast_runs r2
        JOIN forecast_models m2 ON m2.id = r2.model_id
        WHERE m2.version = 'mosquito-campground-v3' AND r2.status = 'published'
        ORDER BY r2.generated_at DESC LIMIT 1
      )
  `;
  console.log(
    JSON.stringify(
      { runs: latestRuns, comparison: rows[0], v3EvidenceMean: evidence[0] },
      null,
      2,
    ),
  );
} finally {
  await sqlClient.end();
}
