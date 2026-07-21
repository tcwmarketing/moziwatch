import { maintenanceDatabaseUrl } from "@/db/maintenance-url";
import postgres from "postgres";

const sqlClient = postgres(maintenanceDatabaseUrl(), {
  max: 1,
  prepare: false,
  connect_timeout: 15,
  idle_timeout: 20,
});

const dryRun = process.argv.includes("--dry-run");
const forecastRetentionDays = Math.max(
  1,
  Math.min(90, Number(process.env.FORECAST_RETENTION_DAYS) || 1),
);
const failedRunRetentionDays = Math.max(
  1,
  Math.min(14, Number(process.env.FORECAST_FAILED_RETENTION_DAYS) || 2),
);
const monthlyRetentionDays = Math.max(
  365,
  Math.min(1_825, Number(process.env.MONTHLY_FORECAST_RETENTION_DAYS) || 550),
);
const historyRetentionDays = Math.max(
  90,
  Math.min(730, Number(process.env.WEATHER_HISTORY_RETENTION_DAYS) || 90),
);
const rawWeatherRetentionDays = Math.max(
  2,
  Math.min(14, Number(process.env.RAW_WEATHER_RETENTION_DAYS) || 3),
);

type Candidate = {
  id: string;
  version: string;
  status: string;
  forecast_date: string;
  reason: string;
};

try {
  const candidates = await sqlClient<Candidate[]>`
    SELECT fr.id, fm.version, fr.status::text,
      fr.forecast_date::text,
      CASE
        WHEN fm.version = 'mosquito-weather-beta-v1' THEN 'obsolete-grid-v1'
        WHEN fr.status <> 'published' THEN 'expired-incomplete-run'
        WHEN fm.model_kind = 'campground-monthly-climatology-seasonal-beta'
          THEN 'expired-monthly-run'
        ELSE 'expired-daily-run'
      END AS reason
    FROM forecast_runs fr
    JOIN forecast_models fm ON fm.id = fr.model_id
    WHERE
      fm.version = 'mosquito-weather-beta-v1'
      OR (
        fr.status <> 'published'
        AND fr.created_at < now() - (${failedRunRetentionDays} * interval '1 day')
      )
      OR (
        fr.status = 'published'
        AND fm.model_kind = 'campground-monthly-climatology-seasonal-beta'
        AND fr.forecast_date < (
          CURRENT_DATE - (${monthlyRetentionDays} * interval '1 day')
        )
      )
      OR (
        fr.status = 'published'
        AND fm.model_kind IN (
          'campground-habitat-weather-beta',
          'campground-weather-habitat-report-index'
        )
        AND fr.forecast_date < (
          CURRENT_DATE - (${forecastRetentionDays} * interval '1 day')
        )
      )
    ORDER BY fr.created_at
  `;

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          dryRun: true,
          policy: {
            forecastRetentionDays,
            failedRunRetentionDays,
            monthlyRetentionDays,
            historyRetentionDays,
            rawWeatherRetentionDays,
          },
          runCount: candidates.length,
          runs: candidates,
        },
        null,
        2,
      ),
    );
  } else {
    for (const candidate of candidates) {
      await sqlClient`DELETE FROM forecast_runs WHERE id = ${candidate.id}::uuid`;
    }

    const legacyModels = await sqlClient<{ version: string }[]>`
      DELETE FROM forecast_models
      WHERE version = 'mosquito-weather-beta-v1'
        AND NOT EXISTS (
          SELECT 1 FROM forecast_runs WHERE model_id = forecast_models.id
        )
      RETURNING version
    `;
    const history = await sqlClient<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM campground_weather_history_daily
        WHERE observed_on < (
          CURRENT_DATE - (${historyRetentionDays} * interval '1 day')
        )
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;
    const rawWeather = await sqlClient<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM weather_observations
        WHERE created_at < now() - (${rawWeatherRetentionDays} * interval '1 day')
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;
    const compactedLegacyPayloads = await sqlClient<{ updated: number }[]>`
      WITH updated AS (
        UPDATE campground_weather_observations
        SET raw_payload = jsonb_build_object(
          'provider', provider,
          'compactedLegacyProviderPayload', true,
          'normalizedInputsRetained', true,
          'note', 'The normalized weather variables used by the model remain in this row.'
        )
        WHERE created_at < date_trunc('day', now())
          AND pg_column_size(raw_payload) > 2048
        RETURNING 1
      )
      SELECT count(*)::int AS updated FROM updated
    `;
    const compactedHistoricalVariables = await sqlClient<{ updated: number }[]>`
      WITH updated AS (
        UPDATE campground_weather_observations
        SET variables = variables - 'history' - 'hourly'
        WHERE created_at < date_trunc('day', now())
          AND (variables ? 'history' OR variables ? 'hourly')
        RETURNING 1
      )
      SELECT count(*)::int AS updated FROM updated
    `;
    const interest = await sqlClient<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM campground_forecast_interest_daily
        WHERE activity_date < CURRENT_DATE - interval '180 days'
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;
    const orphanLogs = await sqlClient<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM forecast_job_logs
        WHERE run_id IS NULL AND created_at < now() - interval '30 days'
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;
    const obsoleteProfiles = await sqlClient<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM campground_habitat_profiles hp
        USING habitat_profile_versions pv
        WHERE hp.profile_version_id = pv.id
          AND hp.active = false
          AND (
            pv.data_kind = 'representative-prototype'
            OR pv.version = 'habitat-major-fast-v1'
          )
          AND NOT EXISTS (
            SELECT 1 FROM campground_forecasts cf
            WHERE cf.habitat_profile_id = hp.id
          )
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;
    const obsoleteVersions = await sqlClient<{ deleted: number }[]>`
      WITH deleted AS (
        DELETE FROM habitat_profile_versions pv
        WHERE (
            pv.data_kind = 'representative-prototype'
            OR pv.version = 'habitat-major-fast-v1'
          )
          AND NOT EXISTS (
            SELECT 1 FROM campground_habitat_profiles hp
            WHERE hp.profile_version_id = pv.id
          )
        RETURNING 1
      )
      SELECT count(*)::int AS deleted FROM deleted
    `;

    await sqlClient`ANALYZE campground_weather_observations`;
    await sqlClient`ANALYZE campground_weather_history_daily`;
    await sqlClient`ANALYZE campground_forecasts`;
    await sqlClient`ANALYZE campground_forecast_evidence`;
    await sqlClient`ANALYZE forecast_runs`;

    console.log(
      JSON.stringify(
        {
          dryRun: false,
          deletedRuns: candidates.length,
          deletedRunReasons: candidates.reduce<Record<string, number>>(
            (counts, candidate) => {
              counts[candidate.reason] = (counts[candidate.reason] || 0) + 1;
              return counts;
            },
            {},
          ),
          deletedLegacyModels: legacyModels.map((model) => model.version),
          deletedWeatherHistoryRows: history[0]?.deleted || 0,
          deletedRawWeatherRows: rawWeather[0]?.deleted || 0,
          compactedLegacyCampgroundPayloads:
            compactedLegacyPayloads[0]?.updated || 0,
          compactedHistoricalWeatherVariables:
            compactedHistoricalVariables[0]?.updated || 0,
          deletedInterestRows: interest[0]?.deleted || 0,
          deletedOrphanLogs: orphanLogs[0]?.deleted || 0,
          deletedInactiveObsoleteProfiles: obsoleteProfiles[0]?.deleted || 0,
          deletedUnusedObsoleteVersions: obsoleteVersions[0]?.deleted || 0,
          policy: {
            forecastRetentionDays,
            failedRunRetentionDays,
            monthlyRetentionDays,
            historyRetentionDays,
            rawWeatherRetentionDays,
          },
        },
        null,
        2,
      ),
    );
  }
} finally {
  await sqlClient.end();
}
