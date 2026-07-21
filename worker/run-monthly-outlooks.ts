import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CampgroundBetaForecastModelArtifact,
  CampgroundHabitatProfile,
  CampgroundMonthlyForecastModelArtifact,
  HabitatRings,
} from "@/config/forecast";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import { scoreCampgroundMonthlyOutlook } from "./model";
import { OpenMeteoSeasonalProvider } from "./providers/open-meteo-seasonal";

type ProfileRow = {
  profile_id: string;
  campground_id: string;
  latitude: number;
  longitude: number;
  profile_version: string;
  data_kind: CampgroundHabitatProfile["dataKind"];
  wetland_coverage: HabitatRings;
  marsh_coverage: HabitatRings;
  seasonal_water_coverage: HabitatRings;
  forest_coverage: HabitatRings;
  small_water_body_density: number;
  stagnant_water_potential: number;
  lake_shoreline_proximity: number;
  large_open_water_coverage: number;
  fast_river_proximity: number;
  slow_river_proximity: number;
  vegetation_coverage: number;
  elevation_m: number;
  slope_degrees: number;
  drainage_potential: number;
  annual_rainfall_mm: number;
  warm_season_rainfall_mm: number;
  land_cover_type: string;
  profile_confidence: number;
};

function toProfile(row: ProfileRow): CampgroundHabitatProfile {
  return {
    profileVersion: row.profile_version,
    dataKind: row.data_kind,
    wetlandCoverage: row.wetland_coverage,
    marshCoverage: row.marsh_coverage,
    seasonalWaterCoverage: row.seasonal_water_coverage,
    forestCoverage: row.forest_coverage,
    smallWaterBodyDensity: row.small_water_body_density,
    stagnantWaterPotential: row.stagnant_water_potential,
    lakeShorelineProximity: row.lake_shoreline_proximity,
    largeOpenWaterCoverage: row.large_open_water_coverage,
    fastRiverProximity: row.fast_river_proximity,
    slowRiverProximity: row.slow_river_proximity,
    vegetationCoverage: row.vegetation_coverage,
    elevationM: row.elevation_m,
    slopeDegrees: row.slope_degrees,
    drainagePotential: row.drainage_potential,
    annualRainfallMm: row.annual_rainfall_mm,
    warmSeasonRainfallMm: row.warm_season_rainfall_mm,
    landCoverType: row.land_cover_type,
    profileConfidence: row.profile_confidence,
  };
}

const monthlyModel = JSON.parse(
  await readFile(
    resolve(
      process.env.MONTHLY_FORECAST_MODEL_PATH || "./config/models/monthly.json",
    ),
    "utf8",
  ),
) as CampgroundMonthlyForecastModelArtifact;
const dailyModel = JSON.parse(
  await readFile(
    resolve(process.env.FORECAST_MODEL_PATH || "./config/models/current.json"),
    "utf8",
  ),
) as CampgroundBetaForecastModelArtifact;
if (
  monthlyModel.kind !== "campground-monthly-climatology-seasonal-beta" ||
  monthlyModel.status !== "beta" ||
  monthlyModel.usesUserReports ||
  dailyModel.kind !== "campground-habitat-weather-beta"
)
  throw new Error("Valid report-independent beta forecast models are required");

const provider = new OpenMeteoSeasonalProvider(
  process.env.OPEN_METEO_SEASONAL_BASE_URL,
  process.env.OPEN_METEO_API_KEY,
);
const runMonth = new Date();
runMonth.setUTCDate(1);
runMonth.setUTCHours(0, 0, 0, 0);
const runMonthString = runMonth.toISOString().slice(0, 10);
const targetCount = Math.max(
  1,
  Math.min(10_000, Number(process.env.MONTHLY_FORECAST_TARGET_COUNT) || 1_500),
);
const batchDelayMs = Math.max(
  1_000,
  Math.min(30_000, Number(process.env.MONTHLY_WEATHER_BATCH_DELAY_MS) || 4_000),
);
let runId: string | null = null;

try {
  const modelRows = await sqlClient.begin(async (tx) => {
    await tx`
      UPDATE forecast_models SET active = false
      WHERE active = true AND model_kind = ${monthlyModel.kind}
        AND version <> ${monthlyModel.version}
    `;
    return tx<{ id: string }[]>`
      INSERT INTO forecast_models (
        version, model_kind, artifact, evaluation, model_created_at, active
      ) VALUES (
        ${monthlyModel.version}, ${monthlyModel.kind},
        ${toPostgresJson(monthlyModel)}::jsonb,
        ${toPostgresJson(monthlyModel.evaluation)}::jsonb,
        ${monthlyModel.createdAt}::timestamptz, true
      )
      ON CONFLICT (version) DO UPDATE SET
        artifact = excluded.artifact,
        evaluation = excluded.evaluation,
        active = true
      RETURNING id
    `;
  });
  const runRows = await sqlClient<{ id: string }[]>`
    INSERT INTO forecast_runs (model_id, forecast_date, status, source)
    VALUES (
      ${modelRows[0].id}::uuid, ${runMonthString}::date,
      'running', ${provider.name}
    )
    ON CONFLICT (model_id, forecast_date) DO UPDATE SET
      status = 'running', error = NULL, generated_at = NULL
    RETURNING id
  `;
  runId = runRows[0].id;
  if (process.env.MONTHLY_FORECAST_RESET === "true") {
    await sqlClient.begin(async (tx) => {
      await tx`DELETE FROM campground_monthly_outlooks WHERE run_id = ${runId}::uuid`;
      await tx`DELETE FROM campground_weather_observations WHERE run_id = ${runId}::uuid`;
    });
  }
  const profiles = await sqlClient<ProfileRow[]>`
    SELECT hp.id AS profile_id, hp.campground_id, c.latitude, c.longitude,
      pv.version AS profile_version, pv.data_kind,
      hp.wetland_coverage, hp.marsh_coverage, hp.seasonal_water_coverage,
      hp.forest_coverage, hp.small_water_body_density,
      hp.stagnant_water_potential, hp.lake_shoreline_proximity,
      hp.large_open_water_coverage, hp.fast_river_proximity,
      hp.slow_river_proximity, hp.vegetation_coverage, hp.elevation_m,
      hp.slope_degrees, hp.drainage_potential, hp.annual_rainfall_mm,
      hp.warm_season_rainfall_mm, hp.land_cover_type, hp.profile_confidence
    FROM campground_habitat_profiles hp
    JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
    JOIN campgrounds c ON c.id = hp.campground_id
    JOIN campground_forecast_schedules fs ON fs.campground_id = c.id
    WHERE hp.active = true AND c.active = true
      AND c.operational_status NOT IN ('closed', 'review')
      AND fs.cadence = 'daily'
      AND NOT EXISTS (
        SELECT 1 FROM campground_weather_observations observations
        WHERE observations.run_id = ${runId}::uuid
          AND observations.campground_id = hp.campground_id
      )
    ORDER BY fs.priority_score DESC, hp.campground_id
    LIMIT ${targetCount}
  `;
  let outlookCount = 0;
  for (let offset = 0; offset < profiles.length; offset += 25) {
    const batch = profiles.slice(offset, offset + 25);
    const seasonal = await provider.fetchMonthlyOutlooks(
      batch.map((row) => ({
        id: row.campground_id,
        latitude: row.latitude,
        longitude: row.longitude,
      })),
    );
    const weatherRows: Array<Record<string, unknown>> = [];
    const outlookRows: Array<Record<string, unknown>> = [];
    for (let index = 0; index < batch.length; index++) {
      const row = batch[index];
      const site = seasonal[index];
      if (site.campgroundId !== row.campground_id)
        throw new Error("Seasonal response campground order changed");
      weatherRows.push({
        run_id: runId,
        campground_id: row.campground_id,
        observed_for: runMonthString,
        provider: provider.name,
        variables: { outlook: site.outlook },
        raw_payload: site.raw,
      });
      for (const month of site.outlook) {
        const result = scoreCampgroundMonthlyOutlook(
          monthlyModel,
          dailyModel,
          toProfile(row),
          month,
        );
        outlookRows.push({
          run_id: runId,
          campground_id: row.campground_id,
          habitat_profile_id: row.profile_id,
          target_month: month.targetMonth,
          score: result.score,
          level: result.level,
          confidence: result.confidence,
          factors: result.factors,
          components: result.components,
          source_kind: "climatology-plus-seasonal-ensemble",
        });
      }
    }
    await sqlClient.begin(async (tx) => {
      await tx`
        INSERT INTO campground_weather_observations (
          run_id, campground_id, observed_for, provider, variables, raw_payload
        )
        SELECT run_id::uuid, campground_id::uuid, observed_for::date,
          provider, variables, raw_payload
        FROM jsonb_to_recordset(${toPostgresJson(weatherRows)}::jsonb) AS data(
          run_id text, campground_id text, observed_for text, provider text,
          variables jsonb, raw_payload jsonb
        )
        ON CONFLICT (run_id, campground_id, observed_for) DO UPDATE SET
          provider = excluded.provider,
          variables = excluded.variables,
          raw_payload = excluded.raw_payload
      `;
      await tx`
        INSERT INTO campground_monthly_outlooks (
          run_id, campground_id, habitat_profile_id, target_month,
          score, level, confidence, factors, components, source_kind
        )
        SELECT run_id::uuid, campground_id::uuid, habitat_profile_id::uuid,
          target_month::date, score, level, confidence, factors, components,
          source_kind
        FROM jsonb_to_recordset(${toPostgresJson(outlookRows)}::jsonb) AS data(
          run_id text, campground_id text, habitat_profile_id text,
          target_month text, score double precision, level text,
          confidence double precision, factors jsonb, components jsonb,
          source_kind text
        )
        ON CONFLICT (run_id, campground_id, target_month) DO UPDATE SET
          habitat_profile_id = excluded.habitat_profile_id,
          score = excluded.score,
          level = excluded.level,
          confidence = excluded.confidence,
          factors = excluded.factors,
          components = excluded.components,
          source_kind = excluded.source_kind
      `;
    });
    outlookCount += outlookRows.length;
    console.log(
      `Monthly outlook progress: ${Math.min(offset + batch.length, profiles.length)}/${profiles.length} campgrounds`,
    );
    if (offset + batch.length < profiles.length)
      await new Promise((resolve) => setTimeout(resolve, batchDelayMs));
  }
  const totals = await sqlClient<
    Array<{ campground_count: number; outlook_count: number }>
  >`
    SELECT count(DISTINCT campground_id)::int AS campground_count,
      count(*)::int AS outlook_count
    FROM campground_monthly_outlooks
    WHERE run_id = ${runId}::uuid
  `;
  const campgroundCount = totals[0]?.campground_count || 0;
  const totalOutlookCount = totals[0]?.outlook_count || 0;
  if (!campgroundCount)
    throw new Error("No active campground habitat profiles are available");
  await sqlClient.begin(async (tx) => {
    await tx`
      UPDATE forecast_runs SET status = 'published', generated_at = now()
      WHERE id = ${runId}::uuid
    `;
    await tx`
      INSERT INTO forecast_job_logs (run_id, level, message, details)
      VALUES (
        ${runId}::uuid, 'info', 'Monthly campground outlooks published',
        ${toPostgresJson({
          modelVersion: monthlyModel.version,
          provider: provider.name,
          campgroundCount,
          outlookCount: totalOutlookCount,
          newOutlookCount: outlookCount,
          maximumHorizonMonths: 7,
        })}::jsonb
      )
    `;
  });
  console.log(
    `Published ${totalOutlookCount} monthly outlooks for ${campgroundCount} campgrounds using ${monthlyModel.version}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (runId) {
    await sqlClient`
      UPDATE forecast_runs SET status = 'failed', error = ${message}
      WHERE id = ${runId}::uuid
    `;
    await sqlClient`
      INSERT INTO forecast_job_logs (run_id, level, message)
      VALUES (${runId}::uuid, 'error', ${message})
    `;
  }
  throw error;
} finally {
  await sqlClient.end();
}
