import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ForecastFeature, ForecastModelArtifact } from "@/config/forecast";
import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";
import { toPostgresJson } from "@/lib/postgres-json";
import { createNorthAmericaGrid } from "./grid";
import {
  assertFiniteFeatures,
  requiredFeatures,
  scoreForecast,
  type FeatureVector,
} from "./model";
import { OpenMeteoProvider } from "./providers/open-meteo";
import { UnavailableEnvironmentalProvider } from "./providers/environment";

const modelPath = resolve(
  process.env.FORECAST_MODEL_PATH || "./config/models/current.json",
);
const model = JSON.parse(
  await readFile(modelPath, "utf8"),
) as ForecastModelArtifact;
if (
  !model.version ||
  !["logistic-regression", "weather-index-beta"].includes(model.kind)
)
  throw new Error("A valid versioned forecast artifact is required");
if (model.kind === "weather-index-beta" && model.usesUserReports)
  throw new Error("The beta weather model must not use user reports");

const weatherProvider = new OpenMeteoProvider(
  process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/ecmwf",
  process.env.OPEN_METEO_API_KEY,
);
const environmentProvider = new UnavailableEnvironmentalProvider();
const forecastDate = new Date();
forecastDate.setUTCHours(0, 0, 0, 0);
const forecastDateString = forecastDate.toISOString().slice(0, 10);
const modelCreatedAt =
  model.kind === "logistic-regression" ? model.trainedAt : model.createdAt;
let runId: string | null = null;

try {
  const modelRows = await sqlClient.begin(async (tx) => {
    await tx`UPDATE forecast_models SET active = false WHERE active = true AND version <> ${model.version}`;
    return tx<{ id: string }[]>`
      INSERT INTO forecast_models (version, model_kind, artifact, evaluation, model_created_at, active)
      VALUES (${model.version}, ${model.kind}, ${toPostgresJson(model)}::jsonb, ${toPostgresJson(model.kind === "logistic-regression" ? model.temporalHoldout : model.evaluation)}::jsonb, ${modelCreatedAt}::timestamptz, true)
      ON CONFLICT (version) DO UPDATE SET artifact = excluded.artifact, evaluation = excluded.evaluation, active = true
      RETURNING id
    `;
  });
  const runRows = await sqlClient<{ id: string }[]>`
    INSERT INTO forecast_runs (model_id, forecast_date, status) VALUES (${modelRows[0].id}::uuid, ${forecastDateString}::date, 'running')
    ON CONFLICT (model_id, forecast_date) DO UPDATE SET status = 'running', error = NULL RETURNING id
  `;
  runId = runRows[0].id;
  const grid = createNorthAmericaGrid();
  const reports = model.usesUserReports
    ? await sqlClient<
        {
          latitude: number;
          longitude: number;
          rating: number;
          submitted_at: DatabaseDate;
        }[]
      >`
    SELECT c.latitude, c.longitude, r.rating, r.submitted_at FROM reports r
    JOIN campgrounds c ON c.id = r.campground_id
    WHERE r.moderation_status = 'published' AND r.deleted_at IS NULL AND r.submitted_at >= now() - interval '30 days'
      `
    : [];
  for (let offset = 0; offset < grid.length; offset += 100) {
    const cells = grid.slice(offset, offset + 100);
    const weather = await weatherProvider.fetchCurrentDay(
      cells,
      forecastDateString,
    );
    await sqlClient.begin(async (tx) => {
      for (let index = 0; index < cells.length; index++) {
        const cell = cells[index],
          observation = weather[index];
        const needsWetland =
          model.kind === "logistic-regression" &&
          model.coefficients.wetland_proximity !== 0;
        const environment = needsWetland
          ? await environmentProvider.values(cell.latitude, cell.longitude)
          : { wetlandProximity: null, landCover: null };
        const day = Math.floor(
          (forecastDate.getTime() -
            Date.UTC(forecastDate.getUTCFullYear(), 0, 0)) /
            86400000,
        );
        const recentReportSignal = reports.reduce((sum, report) => {
          const distanceSquared =
            (report.latitude - cell.latitude) ** 2 +
            ((report.longitude - cell.longitude) *
              Math.cos((cell.latitude * Math.PI) / 180)) **
              2;
          const ageDays =
            (forecastDate.getTime() -
              parseDatabaseDate(report.submitted_at).getTime()) /
            86400000;
          return (
            sum +
            (Math.max(0, report.rating - 1) / 4) *
              Math.exp(-distanceSquared / 4) *
              Math.exp(-ageDays / 10)
          );
        }, 0);
        const partial: Partial<FeatureVector> = {
          temperature_2m_mean:
            observation.variables.temperature_2m_mean ?? undefined,
          relative_humidity_2m_mean:
            observation.variables.relative_humidity_2m_mean ?? undefined,
          dew_point_2m_mean:
            observation.variables.dew_point_2m_mean ?? undefined,
          precipitation_sum:
            observation.variables.precipitation_sum ?? undefined,
          precipitation_7d: observation.variables.precipitation_7d ?? undefined,
          wind_speed_10m_mean:
            observation.variables.wind_speed_10m_mean ?? undefined,
          soil_moisture_0_to_7cm_mean:
            observation.variables.soil_moisture_0_to_7cm_mean ?? undefined,
          elevation: observation.elevation ?? undefined,
          latitude: cell.latitude,
          day_of_year_sin: Math.sin((2 * Math.PI * day) / 365.25),
          day_of_year_cos: Math.cos((2 * Math.PI * day) / 365.25),
          wetland_proximity: environment.wetlandProximity ?? undefined,
          recent_report_signal: model.usesUserReports
            ? recentReportSignal
            : undefined,
        };
        if (model.kind === "logistic-regression") {
          for (const feature of Object.keys(
            model.coefficients,
          ) as ForecastFeature[]) {
            if (
              partial[feature] === undefined &&
              model.coefficients[feature] === 0
            )
              partial[feature] = model.normalization[feature].mean;
          }
        }
        assertFiniteFeatures(partial, requiredFeatures(model));
        const score = scoreForecast(model, partial);
        await tx`INSERT INTO weather_observations (run_id, cell_key, latitude, longitude, observed_for, provider, variables, raw_payload) VALUES (${runId}::uuid, ${cell.key}, ${cell.latitude}, ${cell.longitude}, ${forecastDateString}::date, ${weatherProvider.name}, ${toPostgresJson(observation.variables)}::jsonb, ${toPostgresJson(observation.raw)}::jsonb) ON CONFLICT (run_id, cell_key) DO UPDATE SET variables = excluded.variables, raw_payload = excluded.raw_payload`;
        await tx`INSERT INTO forecast_cells (run_id, cell_key, latitude, longitude, score, cell_geojson, features) VALUES (${runId}::uuid, ${cell.key}, ${cell.latitude}, ${cell.longitude}, ${score}, ${toPostgresJson(cell.geojson)}::jsonb, ${toPostgresJson(partial)}::jsonb) ON CONFLICT (run_id, cell_key) DO UPDATE SET score = excluded.score, features = excluded.features`;
      }
    });
  }
  await sqlClient`UPDATE forecast_runs SET status = 'published', generated_at = now() WHERE id = ${runId}::uuid`;
  await sqlClient`INSERT INTO forecast_job_logs (run_id, level, message, details) VALUES (${runId}::uuid, 'info', 'Forecast published', ${toPostgresJson({ modelVersion: model.version, provider: weatherProvider.name })}::jsonb)`;
  console.log(`Published forecast ${runId} with model ${model.version}`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (runId)
    await sqlClient`UPDATE forecast_runs SET status = 'failed', error = ${message} WHERE id = ${runId}::uuid`;
  await sqlClient`INSERT INTO forecast_job_logs (run_id, level, message) VALUES (${runId}::uuid, 'error', ${message})`;
  throw error;
} finally {
  await sqlClient.end();
}
