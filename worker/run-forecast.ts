import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CampgroundBetaForecastModelArtifact,
  CampgroundHabitatProfile,
  CampgroundWeatherOutlook,
  HabitatRings,
} from "@/config/forecast";
import {
  forecastModelMode,
  type CampgroundV3WeatherOutlook,
  type CampgroundV3ModelArtifact,
  type V3WeatherHistoryDay,
} from "@/config/forecast-v3";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import { scoreCampgroundForecast } from "./model";
import { scoreCampgroundV3 } from "./model-v3";
import { OpenMeteoProvider } from "./providers/open-meteo";
import { loadForecastReports } from "./report-evidence";
import {
  markForecastSchedulesPublished,
  syncForecastSchedules,
} from "./forecast-schedule";
import { refreshRecentReportSummaries } from "./report-summaries";

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
  shoreline_water_edge_length_km: number;
  large_open_water_coverage: number;
  fast_river_proximity: number;
  slow_river_proximity: number;
  vegetation_coverage: number;
  elevation_m: number;
  slope_degrees: number;
  drainage_potential: number;
  floodplain_exposure: number;
  annual_rainfall_mm: number;
  warm_season_rainfall_mm: number;
  land_cover_type: string;
  profile_confidence: number;
  data_coverage: CampgroundHabitatProfile["dataCoverage"] | null;
  recent_average: number | null;
  historical_average: number | null;
  forecast_cadence: "daily" | "weekly" | "paused";
};

type WeatherTarget = {
  id: string;
  latitude: number;
  longitude: number;
  profiles: ProfileRow[];
  regional: boolean;
};

type CampgroundModelWeather = {
  campgroundId: string;
  outlook: CampgroundWeatherOutlook[];
  v3Outlook: CampgroundV3WeatherOutlook[];
  history: V3WeatherHistoryDay[];
  elevation: number | null;
  raw: Record<string, unknown>;
};

type SharedWeatherVariables = {
  outlook: CampgroundWeatherOutlook[];
  v3Outlook: CampgroundV3WeatherOutlook[];
  history: V3WeatherHistoryDay[];
  elevation: number | null;
};

type CachedObservationRow = {
  target_id: string;
  cell_key: string;
  distance_km: number;
  variables: SharedWeatherVariables;
  raw_payload: Record<string, unknown>;
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
    shorelineWaterEdgeLengthKm: row.shoreline_water_edge_length_km,
    largeOpenWaterCoverage: row.large_open_water_coverage,
    fastRiverProximity: row.fast_river_proximity,
    slowRiverProximity: row.slow_river_proximity,
    vegetationCoverage: row.vegetation_coverage,
    elevationM: row.elevation_m,
    slopeDegrees: row.slope_degrees,
    drainagePotential: row.drainage_potential,
    floodplainExposure: row.floodplain_exposure,
    annualRainfallMm: row.annual_rainfall_mm,
    warmSeasonRainfallMm: row.warm_season_rainfall_mm,
    landCoverType: row.land_cover_type,
    profileConfidence: row.profile_confidence,
    dataCoverage: row.data_coverage || undefined,
  };
}

async function readJson<T>(path: string) {
  return JSON.parse(await readFile(resolve(path), "utf8")) as T;
}

const mode = forecastModelMode();
const v2 = await readJson<CampgroundBetaForecastModelArtifact>(
  process.env.FORECAST_V2_MODEL_PATH ||
    process.env.FORECAST_MODEL_PATH ||
    "./config/models/v2.json",
);
const v3 = await readJson<CampgroundV3ModelArtifact>(
  process.env.FORECAST_V3_MODEL_PATH || "./config/models/v3.json",
);
if (
  v2.kind !== "campground-habitat-weather-beta" ||
  v2.version !== "mosquito-campground-beta-v2" ||
  v2.usesUserReports
)
  throw new Error("The frozen mosquito-campground-beta-v2 artifact is invalid");
if (
  v3.kind !== "campground-weather-habitat-report-index" ||
  v3.version !== "mosquito-campground-v3" ||
  !v3.usesRecentUserReports ||
  !v3.usesHistoricalUserReports
)
  throw new Error("The mosquito-campground-v3 artifact is invalid");

const selected =
  mode === "v2"
    ? [{ artifact: v2, production: true }]
    : mode === "v3"
      ? [{ artifact: v3, production: true }]
      : [
          { artifact: v2, production: true },
          { artifact: v3, production: false },
        ];
const weatherProvider = new OpenMeteoProvider(
  process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast",
  process.env.OPEN_METEO_API_KEY,
);
const generatedAt = new Date();
const forecastDate = new Date(generatedAt);
forecastDate.setUTCHours(0, 0, 0, 0);
const forecastDateString = forecastDate.toISOString().slice(0, 10);
const runs = new Map<string, string>();
const publishedHorizonDays = 8;

async function registerRun(
  artifact: CampgroundBetaForecastModelArtifact | CampgroundV3ModelArtifact,
  production: boolean,
) {
  const evaluation =
    "evaluation" in artifact
      ? artifact.evaluation
      : {
          method: "transparent-experimental-index",
          machineLearning: false,
          calibratedProbability: false,
        };
  const modelRows = await sqlClient.begin(async (tx) => {
    if (production)
      await tx`UPDATE forecast_models SET active = false WHERE active = true`;
    return tx<{ id: string }[]>`
      INSERT INTO forecast_models (
        version, model_kind, artifact, evaluation, model_created_at, active
      ) VALUES (
        ${artifact.version}, ${artifact.kind}, ${toPostgresJson(artifact)}::jsonb,
        ${toPostgresJson(evaluation)}::jsonb, ${artifact.createdAt}::timestamptz,
        ${production}
      )
      ON CONFLICT (version) DO UPDATE SET
        artifact = excluded.artifact, evaluation = excluded.evaluation,
        active = excluded.active
      RETURNING id
    `;
  });
  const runRows = await sqlClient<{ id: string }[]>`
    INSERT INTO forecast_runs (
      model_id, forecast_date, status, is_production, deployment_mode
    ) VALUES (
      ${modelRows[0].id}::uuid, ${forecastDateString}::date, 'running',
      ${production}, ${mode}
    )
    ON CONFLICT (model_id, forecast_date) DO UPDATE SET
      status = 'running', error = NULL, generated_at = NULL,
      is_production = excluded.is_production,
      deployment_mode = excluded.deployment_mode
    RETURNING id
  `;
  runs.set(artifact.version, runRows[0].id);
}

async function loadCachedRegionalWeather(
  targets: WeatherTarget[],
): Promise<CampgroundModelWeather[]> {
  const rawWeatherRunId = runs.get(v2.version) || runs.get(v3.version);
  if (!rawWeatherRunId || !targets.length) return [];
  const maximumDistanceKm = Math.max(
    50,
    Math.min(
      500,
      Number(process.env.FORECAST_CACHED_WEATHER_MAX_DISTANCE_KM) || 500,
    ),
  );
  const rows = await sqlClient<CachedObservationRow[]>`
    WITH target_points AS (
      SELECT id, maximum_distance_km,
        ST_SetSRID(ST_MakePoint(longitude, latitude), 4326) AS point
      FROM jsonb_to_recordset(${toPostgresJson(
        targets.map((target) => ({
          id: target.id,
          latitude: target.latitude,
          longitude: target.longitude,
          maximum_distance_km: target.regional
            ? maximumDistanceKm
            : Math.min(100, maximumDistanceKm),
        })),
      )}::jsonb) AS target(
        id text, latitude double precision, longitude double precision,
        maximum_distance_km double precision
      )
    ), nearest AS (
      SELECT targets.id AS target_id, targets.maximum_distance_km,
        source.cell_key, source.variables, source.raw_payload,
        ST_Distance(targets.point::geography, source.point::geography) / 1000 AS distance_km
      FROM target_points targets
      CROSS JOIN LATERAL (
        SELECT observations.cell_key, observations.variables,
          observations.raw_payload,
          ST_SetSRID(
            ST_MakePoint(observations.longitude, observations.latitude), 4326
          ) AS point
        FROM weather_observations observations
        WHERE observations.run_id = ${rawWeatherRunId}::uuid
        ORDER BY ST_SetSRID(
          ST_MakePoint(observations.longitude, observations.latitude), 4326
        ) <-> targets.point
        LIMIT 1
      ) source
    ), matched AS (
      SELECT * FROM nearest WHERE distance_km <= maximum_distance_km
    )
    SELECT matched.target_id, matched.cell_key, matched.distance_km,
      matched.variables, matched.raw_payload
    FROM matched
    ORDER BY matched.target_id
  `;
  const cachedByTarget = new Map(rows.map((row) => [row.target_id, row]));
  return targets.flatMap((target) => {
    const cached = cachedByTarget.get(target.id);
    if (
      !cached ||
      cached.variables.outlook.length < 15 ||
      cached.variables.v3Outlook.length < 8
    )
      return [];
    const distanceCompleteness = Math.max(0.5, 1 - cached.distance_km / 1_000);
    const v3Outlook = cached.variables.v3Outlook.map((day) => ({
      ...day,
      completeness: day.completeness * distanceCompleteness,
    }));
    return [
      {
        campgroundId: target.id,
        outlook: cached.variables.outlook,
        v3Outlook,
        history: cached.variables.history,
        elevation: cached.variables.elevation,
        raw: {
          ...cached.raw_payload,
          sourceModel: "cached nearby Open-Meteo weather target",
          cachedRegionalWeather: true,
          sourceWeatherCellKey: cached.cell_key,
          distanceKm: cached.distance_km,
          maximumDistanceKm,
        },
      },
    ];
  });
}

try {
  const reportSummary = await refreshRecentReportSummaries(generatedAt);
  await syncForecastSchedules();
  for (const item of selected)
    await registerRun(item.artifact, item.production);

  const scheduledProfiles = await sqlClient<ProfileRow[]>`
    SELECT hp.id AS profile_id, hp.campground_id, c.latitude, c.longitude,
      pv.version AS profile_version, pv.data_kind, hp.wetland_coverage,
      hp.marsh_coverage, hp.seasonal_water_coverage, hp.forest_coverage,
      hp.small_water_body_density, hp.stagnant_water_potential,
      hp.lake_shoreline_proximity, hp.shoreline_water_edge_length_km,
      hp.large_open_water_coverage, hp.fast_river_proximity,
      hp.slow_river_proximity, hp.vegetation_coverage, hp.elevation_m,
      hp.slope_degrees, hp.drainage_potential, hp.floodplain_exposure,
      hp.annual_rainfall_mm, hp.warm_season_rainfall_mm,
      hp.land_cover_type, hp.profile_confidence, hp.data_coverage,
      aggregates.recent_average, aggregates.historical_average,
      fs.cadence AS forecast_cadence
    FROM campground_habitat_profiles hp
    JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
    JOIN campgrounds c ON c.id = hp.campground_id
    JOIN campground_forecast_schedules fs ON fs.campground_id = c.id
    LEFT JOIN campground_aggregates aggregates
      ON aggregates.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT campsite_count AS official_campsites
      FROM location_source_records source
      WHERE source.campground_id = c.id AND source.campsite_count IS NOT NULL
      ORDER BY
        CASE source.campsite_count_kind
          WHEN 'official_total' THEN 3
          WHEN 'reservable_inventory' THEN 2
          ELSE 1
        END DESC,
        source.authoritative DESC, source.source_priority DESC,
        source.campsite_count_checked_at DESC NULLS LAST
      LIMIT 1
    ) capacity ON true
    WHERE hp.active = true AND c.active = true
      AND (
        ${process.env.FORECAST_FORCE_ALL === "true"}
        OR (fs.cadence <> 'paused' AND
          (fs.next_refresh_at IS NULL OR fs.next_refresh_at <= now()))
      )
    ORDER BY
      CASE fs.cadence WHEN 'daily' THEN 0 WHEN 'weekly' THEN 1 ELSE 2 END,
      fs.priority_score DESC,
      capacity.official_campsites DESC NULLS LAST,
      fs.next_refresh_at ASC NULLS FIRST,
      hp.campground_id
    LIMIT ${Math.max(
      1,
      Math.min(25_000, Number(process.env.FORECAST_TARGET_COUNT) || 5_000),
    )}
  `;
  const requirements = selected.map((item) => ({
    run_id: runs.get(item.artifact.version)!,
    expected: publishedHorizonDays,
  }));
  const completedProfiles = await sqlClient<
    Array<{ campground_id: string; habitat_profile_id: string }>
  >`
    WITH requirements AS (
      SELECT run_id::uuid, expected
      FROM jsonb_to_recordset(${toPostgresJson(requirements)}::jsonb)
        AS item(run_id text, expected integer)
    ), completed_run AS (
      SELECT forecasts.campground_id, forecasts.habitat_profile_id,
        forecasts.run_id
      FROM campground_forecasts forecasts
      JOIN requirements ON requirements.run_id = forecasts.run_id
      GROUP BY forecasts.campground_id, forecasts.habitat_profile_id,
        forecasts.run_id
      HAVING count(*) >= max(requirements.expected)
    )
    SELECT campground_id, habitat_profile_id
    FROM completed_run
    GROUP BY campground_id, habitat_profile_id
    HAVING count(*) = (SELECT count(*) FROM requirements)
  `;
  const completedKeys = new Set(
    completedProfiles.map(
      (row) => `${row.campground_id}:${row.habitat_profile_id}`,
    ),
  );
  const profiles = scheduledProfiles.filter(
    (profile) =>
      !completedKeys.has(`${profile.campground_id}:${profile.profile_id}`),
  );
  const reports = await loadForecastReports(
    profiles.map((profile) => profile.campground_id),
    generatedAt,
  );
  const resumedCampgrounds = scheduledProfiles.length - profiles.length;
  const pendingCampgroundIds = new Set(
    profiles.map((profile) => profile.campground_id),
  );
  const publishedCampgroundIds = new Set(
    scheduledProfiles
      .filter((profile) => !pendingCampgroundIds.has(profile.campground_id))
      .map((profile) => profile.campground_id),
  );
  const counts = new Map(
    selected.map((item) => [
      item.artifact.version,
      resumedCampgrounds * publishedHorizonDays,
    ]),
  );

  // The rich Open-Meteo response is deliberately shared by v2 and v3-shadow.
  // Small coordinate batches keep the combined forecast/archive response
  // responsive. The public API uses one bounded batch at a time with a longer
  // pause; a configured customer key enables the faster bounded default.
  const weatherBatchSize = Math.max(
    1,
    Math.min(100, Number(process.env.FORECAST_WEATHER_BATCH_SIZE) || 10),
  );
  const regionalGridDegrees = Math.max(
    0.1,
    Math.min(1, Number(process.env.FORECAST_REGIONAL_GRID_DEGREES) || 0.75),
  );
  const weatherTargetMap = new Map<string, WeatherTarget>();
  for (const profile of profiles) {
    const regional = profile.forecast_cadence === "weekly";
    const latitude = regional
      ? Math.round(profile.latitude / regionalGridDegrees) * regionalGridDegrees
      : profile.latitude;
    const longitude = regional
      ? Math.round(profile.longitude / regionalGridDegrees) *
        regionalGridDegrees
      : profile.longitude;
    const key = regional
      ? `regional:${latitude.toFixed(3)}:${longitude.toFixed(3)}`
      : `campground:${profile.campground_id}`;
    const existing = weatherTargetMap.get(key);
    if (existing) existing.profiles.push(profile);
    else
      weatherTargetMap.set(key, {
        id: key,
        latitude,
        longitude,
        profiles: [profile],
        regional,
      });
  }
  const weatherTargets = [...weatherTargetMap.values()];
  const regionalTargetCount = weatherTargets.filter(
    (target) => target.regional,
  ).length;
  console.log(
    `Forecast weather targets: ${weatherTargets.length} for ${profiles.length} campgrounds (${regionalTargetCount} shared regional cells).`,
  );
  const weatherBatches = Array.from(
    { length: Math.ceil(weatherTargets.length / weatherBatchSize) },
    (_, index) =>
      weatherTargets.slice(
        index * weatherBatchSize,
        index * weatherBatchSize + weatherBatchSize,
      ),
  );
  const weatherConcurrency = Math.max(
    1,
    Math.min(
      3,
      Number(process.env.FORECAST_WEATHER_CONCURRENCY) ||
        (process.env.OPEN_METEO_API_KEY ? 2 : 1),
    ),
  );
  const weatherGroupDelayMs = Math.max(
    500,
    Math.min(
      15_000,
      Number(process.env.FORECAST_WEATHER_GROUP_DELAY_MS) ||
        (process.env.OPEN_METEO_API_KEY ? 4_000 : 10_000),
    ),
  );
  let liveWeatherUnavailable = false;
  for (
    let offset = 0;
    offset < weatherBatches.length;
    offset += weatherConcurrency
  ) {
    await Promise.all(
      weatherBatches
        .slice(offset, offset + weatherConcurrency)
        .map(async (batch) => {
          let weather: CampgroundModelWeather[] = [];
          if (!liveWeatherUnavailable) {
            try {
              weather = await weatherProvider.fetchCampgroundModelInputs(
                batch.map((target) => ({
                  id: target.id,
                  latitude: target.latitude,
                  longitude: target.longitude,
                })),
                forecastDateString,
              );
            } catch (error) {
              liveWeatherUnavailable = true;
              weather = await loadCachedRegionalWeather(batch);
              if (!weather.length && resumedCampgrounds === 0) throw error;
              console.warn(
                "Live weather is unavailable; the rest of this run will use bounded same-run weather cache coverage.",
              );
            }
          } else {
            weather = await loadCachedRegionalWeather(batch);
          }
          if (liveWeatherUnavailable) {
            console.warn(
              `Using current cached regional weather for ${weather.length}/${batch.length} targets.`,
            );
          }
          const v2Observations: Array<Record<string, unknown>> = [];
          const v2Forecasts: Array<Record<string, unknown>> = [];
          const v3Observations: Array<Record<string, unknown>> = [];
          const v3Forecasts: Array<Record<string, unknown>> = [];

          const weatherByTarget = new Map(
            weather.map((targetWeather) => [
              targetWeather.campgroundId,
              targetWeather,
            ]),
          );
          const rawWeatherRunId = runs.get(v2.version) || runs.get(v3.version)!;
          const rawWeatherRows = batch.flatMap((target) => {
            const targetWeather = weatherByTarget.get(target.id);
            if (!targetWeather) return [];
            return [
              {
                run_id: rawWeatherRunId,
                cell_key: target.id,
                latitude: target.latitude,
                longitude: target.longitude,
                observed_for: forecastDateString,
                provider: weatherProvider.name,
                variables: {
                  regionalWeatherCell: target.regional,
                  regionalGridDegrees: target.regional
                    ? regionalGridDegrees
                    : null,
                  outlook: targetWeather.outlook,
                  v3Outlook: targetWeather.v3Outlook,
                  history: targetWeather.history,
                  elevation: targetWeather.elevation,
                },
                raw_payload: {
                  ...targetWeather.raw,
                  regionalWeatherCell: target.regional,
                  regionalGridDegrees: target.regional
                    ? regionalGridDegrees
                    : null,
                },
              },
            ];
          });
          const expandedWeather = batch.flatMap((target) => {
            const targetWeather = weatherByTarget.get(target.id);
            if (!targetWeather) return [];
            return target.profiles.map((row) => ({
              row,
              regional: target.regional,
              rawWeatherCellKey: target.id,
              siteWeather: {
                ...targetWeather,
                campgroundId: row.campground_id,
                v3Outlook: targetWeather.v3Outlook.map((day) => ({
                  ...day,
                  completeness: target.regional
                    ? day.completeness * 0.9
                    : day.completeness,
                })),
                raw: {
                  ...targetWeather.raw,
                  regionalWeatherCell: target.regional,
                  regionalGridDegrees: target.regional
                    ? regionalGridDegrees
                    : null,
                },
              },
            }));
          });
          if (!expandedWeather.length) return;
          expandedWeather.forEach(({ row }) =>
            publishedCampgroundIds.add(row.campground_id),
          );

          expandedWeather.forEach(
            ({ row, siteWeather, regional, rawWeatherCellKey }) => {
              const profile = toProfile(row);
              const sourceModel = (siteWeather.raw as Record<string, unknown>)
                .sourceModel;
              const compactRawReference = {
                provider: weatherProvider.name,
                sourceModel:
                  typeof sourceModel === "string" ? sourceModel : "best-match",
                completePayloadStoredFor: forecastDateString,
                rawWeatherRunId,
                rawWeatherCellKey,
                regionalWeatherCell: regional,
                note: "The complete provider payload is stored once per weather target; normalized model inputs are retained per campground.",
              };

              if (runs.has(v2.version)) {
                const runId = runs.get(v2.version)!;
                v2Observations.push({
                  run_id: runId,
                  campground_id: row.campground_id,
                  observed_for: forecastDateString,
                  provider: weatherProvider.name,
                  variables: {
                    sourceWeatherCellKey: rawWeatherCellKey,
                    forecastDayCount: siteWeather.outlook.length,
                  },
                  raw_payload: compactRawReference,
                });
                siteWeather.outlook
                  .slice(0, publishedHorizonDays)
                  .forEach((day) => {
                    const result = scoreCampgroundForecast(v2, profile, day);
                    v2Forecasts.push({
                      run_id: runId,
                      campground_id: row.campground_id,
                      habitat_profile_id: row.profile_id,
                      target_date: day.targetDate,
                      day_offset: day.dayOffset,
                      score: result.score,
                      level: result.level,
                      confidence: result.confidence,
                      factors: result.factors,
                      components: result.components,
                    });
                  });
              }

              if (runs.has(v3.version)) {
                const runId = runs.get(v3.version)!;
                v3Observations.push({
                  run_id: runId,
                  campground_id: row.campground_id,
                  observed_for: forecastDateString,
                  provider: weatherProvider.name,
                  variables: {
                    sourceWeatherCellKey: rawWeatherCellKey,
                    forecastDayCount: siteWeather.v3Outlook.length,
                  },
                  raw_payload: compactRawReference,
                });
                siteWeather.v3Outlook.forEach((day) => {
                  const result = scoreCampgroundV3(
                    v3,
                    profile,
                    day,
                    reports.get(row.campground_id) || [],
                    generatedAt,
                    {
                      recent: row.recent_average,
                      historical: row.historical_average,
                    },
                  );
                  const confidenceReasons = regional
                    ? [
                        ...result.confidenceReasons,
                        "Weather is shared from a nearby regional cell for this lower-priority campground.",
                      ]
                    : result.confidenceReasons;
                  v3Forecasts.push({
                    run_id: runId,
                    campground_id: row.campground_id,
                    habitat_profile_id: row.profile_id,
                    target_date: day.targetDate,
                    day_offset: day.dayOffset,
                    score: result.finalForecast.riskIndex / 100,
                    level: result.finalForecast.label,
                    confidence: result.confidence,
                    factors: confidenceReasons,
                    components: {
                      environmentalForecast:
                        result.environmentalForecast.riskIndex / 100,
                      recentReportSignal:
                        (result.recentReports.signal ?? 0) / 100,
                      historicalSeasonalSignal:
                        (result.historicalReports.signal ?? 0) / 100,
                      environmentalWeight: result.environmentalWeight,
                      recentWeight: result.recentReports.weight,
                      historicalWeight: result.historicalReports.weight,
                    },
                    model_config_version: v3.configVersion,
                    weather_provider: weatherProvider.name,
                    weather_run_at: result.weatherRunAt,
                    environmental_result: result.environmentalForecast,
                    recent_report_result: result.recentReports,
                    historical_report_result: result.historicalReports,
                    component_weights: {
                      environmental: result.environmentalWeight,
                      recent: result.recentReports.weight,
                      historical: result.historicalReports.weight,
                    },
                    final_result: {
                      ...result.finalForecast,
                      confidence: result.confidence,
                      confidenceBand: result.confidenceBand,
                      observed30DayRating: result.observed30DayRating,
                      observedHistoricalRating: result.observedHistoricalRating,
                    },
                    confidence_reasons: confidenceReasons,
                  });
                });
              }
            },
          );

          await sqlClient.begin(async (tx) => {
            if (rawWeatherRows.length) {
              await tx`
                INSERT INTO weather_observations (
                  run_id, cell_key, latitude, longitude, observed_for,
                  provider, variables, raw_payload
                )
                SELECT run_id::uuid, cell_key, latitude, longitude,
                  observed_for::date, provider, variables, raw_payload
                FROM jsonb_to_recordset(${toPostgresJson(rawWeatherRows)}::jsonb) AS data(
                  run_id text, cell_key text, latitude double precision,
                  longitude double precision, observed_for text, provider text,
                  variables jsonb, raw_payload jsonb
                )
                ON CONFLICT (run_id, cell_key) DO UPDATE SET
                  latitude = excluded.latitude,
                  longitude = excluded.longitude,
                  observed_for = excluded.observed_for,
                  provider = excluded.provider,
                  variables = excluded.variables,
                  raw_payload = excluded.raw_payload
              `;
            }
            for (const runId of runs.values()) {
              await tx`
              DELETE FROM campground_forecasts
              WHERE run_id = ${runId}::uuid
                AND campground_id IN (
                  SELECT value::uuid
                  FROM jsonb_array_elements_text(${toPostgresJson(expandedWeather.map(({ row }) => row.campground_id))}::jsonb)
                )
            `;
              await tx`
              DELETE FROM campground_weather_observations
              WHERE run_id = ${runId}::uuid
                AND campground_id IN (
                  SELECT value::uuid
                  FROM jsonb_array_elements_text(${toPostgresJson(expandedWeather.map(({ row }) => row.campground_id))}::jsonb)
                )
            `;
            }

            if (v2Observations.length) {
              await tx`
              INSERT INTO campground_weather_observations (
                run_id, campground_id, observed_for, provider, variables, raw_payload
              )
              SELECT run_id::uuid, campground_id::uuid, observed_for::date,
                provider, variables, raw_payload
              FROM jsonb_to_recordset(${toPostgresJson(v2Observations)}::jsonb) AS data(
                run_id text, campground_id text, observed_for text, provider text,
                variables jsonb, raw_payload jsonb
              )
            `;
              await tx`
              INSERT INTO campground_forecasts (
                run_id, campground_id, habitat_profile_id, target_date,
                day_offset, score, level, confidence, factors, components
              )
              SELECT run_id::uuid, campground_id::uuid, habitat_profile_id::uuid,
                target_date::date, day_offset, score, level, confidence,
                factors, components
              FROM jsonb_to_recordset(${toPostgresJson(v2Forecasts)}::jsonb) AS data(
                run_id text, campground_id text, habitat_profile_id text,
                target_date text, day_offset integer, score double precision,
                level text, confidence double precision, factors jsonb,
                components jsonb
              )
            `;
            }

            if (v3Observations.length) {
              await tx`
              INSERT INTO campground_weather_observations (
                run_id, campground_id, observed_for, provider, variables, raw_payload
              )
              SELECT run_id::uuid, campground_id::uuid, observed_for::date,
                provider, variables, raw_payload
              FROM jsonb_to_recordset(${toPostgresJson(v3Observations)}::jsonb) AS data(
                run_id text, campground_id text, observed_for text, provider text,
                variables jsonb, raw_payload jsonb
              )
            `;
              await tx`
              WITH data AS (
                SELECT *
                FROM jsonb_to_recordset(${toPostgresJson(v3Forecasts)}::jsonb) AS item(
                  run_id text, campground_id text, habitat_profile_id text,
                  target_date text, day_offset integer, score double precision,
                  level text, confidence double precision, factors jsonb,
                  components jsonb,
                  model_config_version text, weather_provider text,
                  weather_run_at text, environmental_result jsonb,
                  recent_report_result jsonb, historical_report_result jsonb,
                  component_weights jsonb, final_result jsonb,
                  confidence_reasons jsonb
                )
              ), inserted AS (
                INSERT INTO campground_forecasts (
                  run_id, campground_id, habitat_profile_id, target_date,
                  day_offset, score, level, confidence, factors, components
                )
                SELECT run_id::uuid, campground_id::uuid,
                  habitat_profile_id::uuid, target_date::date, day_offset,
                  score, level, confidence, factors, components
                FROM data
                RETURNING id, campground_id, target_date
              )
              INSERT INTO campground_forecast_evidence (
                forecast_id, model_config_version, weather_provider,
                weather_run_at, environmental_result, recent_report_result,
                historical_report_result, component_weights, final_result,
                confidence_reasons
              )
              SELECT inserted.id, data.model_config_version,
                data.weather_provider, data.weather_run_at::timestamptz,
                data.environmental_result, data.recent_report_result,
                data.historical_report_result, data.component_weights,
                data.final_result, data.confidence_reasons
              FROM inserted
              JOIN data ON data.campground_id::uuid = inserted.campground_id
                AND data.target_date::date = inserted.target_date
            `;
            }
          });
          if (v2Forecasts.length)
            counts.set(
              v2.version,
              counts.get(v2.version)! + v2Forecasts.length,
            );
          if (v3Forecasts.length)
            counts.set(
              v3.version,
              counts.get(v3.version)! + v3Forecasts.length,
            );
        }),
    );
    if (offset + weatherConcurrency < weatherBatches.length)
      await new Promise((resolve) => setTimeout(resolve, weatherGroupDelayMs));
    console.log(
      `Forecast weather progress: ${Math.min(offset + weatherConcurrency, weatherBatches.length)}/${weatherBatches.length} batches`,
    );
  }

  await markForecastSchedulesPublished([...publishedCampgroundIds]);
  for (const item of selected) {
    const runId = runs.get(item.artifact.version)!;
    await sqlClient.begin(async (tx) => {
      await tx`UPDATE forecast_runs SET status = 'published', generated_at = now() WHERE id = ${runId}::uuid`;
      await tx`
        INSERT INTO forecast_job_logs (run_id, level, message, details)
        VALUES (
          ${runId}::uuid, 'info', 'Campground forecast published',
          ${toPostgresJson({
            modelVersion: item.artifact.version,
            deploymentMode: mode,
            production: item.production,
            provider: weatherProvider.name,
            campgroundCount: scheduledProfiles.length,
            refreshedCampgroundCount:
              publishedCampgroundIds.size - resumedCampgrounds,
            resumedCampgroundCount: resumedCampgrounds,
            forecastCount: counts.get(item.artifact.version),
            reportSummary,
          })}::jsonb
        )
      `;
    });
  }
  console.log(
    `Forecast mode ${mode}: ${publishedCampgroundIds.size - resumedCampgrounds} refreshed, ${resumedCampgrounds} resumed; ${[
      ...counts.entries(),
    ]
      .map(([version, count]) => `${version}=${count}`)
      .join(", ")}`,
  );
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  for (const runId of runs.values()) {
    await sqlClient`UPDATE forecast_runs SET status = 'failed', error = ${message} WHERE id = ${runId}::uuid`;
    await sqlClient`INSERT INTO forecast_job_logs (run_id, level, message) VALUES (${runId}::uuid, 'error', ${message})`;
  }
  throw error;
} finally {
  await sqlClient.end();
}
