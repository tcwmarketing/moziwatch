import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import postgres from "postgres";
import {
  maintenanceBatchOptions,
  runMaintenanceBatches,
  deleteExpiredForecastRun,
} from "./maintenance-batches";
import {
  assertDatabaseWritable,
  DatabaseReadOnlyError,
  isDatabaseReadOnlyError,
} from "./database-writable";

const client = postgres(maintenanceDatabaseUrl(), {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  idle_timeout: 20,
});
const dryRun = process.argv.includes("--dry-run");
const days = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => Math.max(min, Math.min(max, Number(value) || fallback));
const policy = {
  forecastRetentionDays: days(process.env.FORECAST_RETENTION_DAYS, 1, 1, 90),
  failedRunRetentionDays: days(
    process.env.FORECAST_FAILED_RETENTION_DAYS,
    2,
    1,
    14,
  ),
  monthlyRetentionDays: days(
    process.env.MONTHLY_FORECAST_RETENTION_DAYS,
    550,
    365,
    1825,
  ),
  historyRetentionDays: days(
    process.env.WEATHER_HISTORY_RETENTION_DAYS,
    90,
    90,
    730,
  ),
  rawWeatherRetentionDays: days(
    process.env.RAW_WEATHER_RETENTION_DAYS,
    3,
    2,
    14,
  ),
};
const options = maintenanceBatchOptions();
const batch = (execute: (limit: number) => Promise<{ count: number }>) =>
  runMaintenanceBatches(execute, options);

try {
  const candidates = await client<
    { id: string; version: string; forecast_date: string; status: string }[]
  >`
    SELECT fr.id, fm.version, fr.forecast_date::text, fr.status::text
    FROM forecast_runs fr JOIN forecast_models fm ON fm.id = fr.model_id
    WHERE fm.version = 'mosquito-weather-beta-v1'
      OR (fr.status <> 'published' AND fr.created_at < now() - (${policy.failedRunRetentionDays} * interval '1 day'))
      OR (fr.status = 'published' AND
        fm.model_kind = 'campground-monthly-climatology-seasonal-beta' AND
        fr.forecast_date < CURRENT_DATE - (${policy.monthlyRetentionDays} * interval '1 day'))
      OR (fr.status = 'published' AND fm.model_kind IN (
        'campground-habitat-weather-beta', 'campground-weather-habitat-report-index'
      ) AND fr.forecast_date < CURRENT_DATE - (${policy.forecastRetentionDays} * interval '1 day'))
    ORDER BY fr.created_at
  `;
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun,
          policy,
          batching: options,
          runCount: candidates.length,
          runs: candidates,
        },
        null,
        2,
      ),
    );
  } else {
    await assertDatabaseWritable(client);
    await client`SET lock_timeout = '3s'`;
    await client`SET statement_timeout = '60s'`;
    let removedRows = 0;
    for (const run of candidates) {
      // Explicitly drain large children before deleting the run. An unrestricted
      // parent DELETE would cascade tens of thousands of rows in one transaction.
      removedRows += await deleteExpiredForecastRun(client, run.id, options);
      console.log(
        `Removed expired forecast run ${run.forecast_date} (${run.version}).`,
      );
    }
    const history = await batch(
      (limit) => client`
      DELETE FROM campground_weather_history_daily WHERE ctid IN (
        SELECT ctid FROM campground_weather_history_daily
        WHERE observed_on < CURRENT_DATE - (${policy.historyRetentionDays} * interval '1 day') LIMIT ${limit}
      )
    `,
    );
    const rawWeather = await batch(
      (limit) => client`
      DELETE FROM weather_observations WHERE ctid IN (
        SELECT ctid FROM weather_observations
        WHERE created_at < now() - (${policy.rawWeatherRetentionDays} * interval '1 day') LIMIT ${limit}
      )
    `,
    );
    const compactedPayloads = await batch(
      (limit) => client`
      UPDATE campground_weather_observations SET raw_payload = jsonb_build_object(
        'provider', provider, 'compactedLegacyProviderPayload', true,
        'normalizedInputsRetained', true
      ) WHERE ctid IN (
        SELECT ctid FROM campground_weather_observations
        WHERE created_at < date_trunc('day', now()) AND pg_column_size(raw_payload) > 2048 LIMIT ${limit}
      )
    `,
    );
    const compactedVariables = await batch(
      (limit) => client`
      UPDATE campground_weather_observations SET variables = variables - 'history' - 'hourly'
      WHERE ctid IN (
        SELECT ctid FROM campground_weather_observations
        WHERE created_at < date_trunc('day', now()) AND (variables ? 'history' OR variables ? 'hourly') LIMIT ${limit}
      )
    `,
    );
    const interest = await batch(
      (limit) => client`
      DELETE FROM campground_forecast_interest_daily WHERE ctid IN (
        SELECT ctid FROM campground_forecast_interest_daily
        WHERE activity_date < CURRENT_DATE - interval '180 days' LIMIT ${limit}
      )
    `,
    );
    const logs = await batch(
      (limit) => client`
      DELETE FROM forecast_job_logs WHERE ctid IN (
        SELECT ctid FROM forecast_job_logs WHERE run_id IS NULL
          AND created_at < now() - interval '30 days' LIMIT ${limit}
      )
    `,
    );
    const profiles = await batch(
      (limit) => client`
      DELETE FROM campground_habitat_profiles WHERE id IN (
        SELECT hp.id FROM campground_habitat_profiles hp
        JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
        WHERE hp.active = false AND (pv.data_kind = 'representative-prototype' OR pv.version = 'habitat-major-fast-v1')
          AND NOT EXISTS (SELECT 1 FROM campground_forecasts cf WHERE cf.habitat_profile_id = hp.id)
        LIMIT ${limit}
      )
    `,
    );
    await client`DELETE FROM habitat_profile_versions pv
      WHERE (pv.data_kind = 'representative-prototype' OR pv.version = 'habitat-major-fast-v1')
        AND NOT EXISTS (SELECT 1 FROM campground_habitat_profiles hp WHERE hp.profile_version_id = pv.id)`;
    await client`DELETE FROM forecast_models fm WHERE fm.version = 'mosquito-weather-beta-v1'
      AND NOT EXISTS (SELECT 1 FROM forecast_runs fr WHERE fr.model_id = fm.id)`;
    for (const table of [
      "weather_observations",
      "campground_forecast_evidence",
      "campground_forecasts",
      "campground_weather_observations",
      "campground_weather_history_daily",
      "forecast_runs",
    ] as const) {
      // Ordinary VACUUM makes free space reusable. No FULL rewrite or exclusive
      // tail-truncation lock is performed by recurring maintenance.
      await client.unsafe(`VACUUM (ANALYZE, TRUNCATE false) public.${table}`);
    }
    console.log(
      JSON.stringify(
        {
          dryRun,
          policy,
          batching: options,
          deletedRuns: candidates.length,
          removedRunRows: removedRows,
          history,
          rawWeather,
          compactedPayloads,
          compactedVariables,
          interest,
          logs,
          profiles,
        },
        null,
        2,
      ),
    );
  }
} catch (error) {
  if (isDatabaseReadOnlyError(error)) {
    console.error(new DatabaseReadOnlyError().message);
    process.exitCode = 78;
  } else throw error;
} finally {
  await client.end();
}
