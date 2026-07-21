import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "./database-date";

type OutlookRow = {
  target_date: DatabaseDate;
  day_offset: number;
  score: number;
  level: string;
  confidence: number;
  factors: string[];
  model_version: string;
  generated_at: DatabaseDate;
  profile_version: string;
  profile_kind: string;
  profile_confidence: number;
  archetype: string | null;
  land_cover_type: string;
  elevation_m: number;
  model_kind: string;
  environmental_result: Record<string, unknown> | null;
  recent_report_result: Record<string, unknown> | null;
  historical_report_result: Record<string, unknown> | null;
  component_weights: Record<string, number> | null;
  final_result: Record<string, unknown> | null;
  confidence_reasons: string[] | null;
  recent_average: number | null;
  historical_average: number | null;
};

type MonthlyOutlookRow = {
  target_month: DatabaseDate;
  score: number;
  level: string;
  confidence: number;
  factors: string[];
  source_kind: string;
  model_version: string;
  generated_at: DatabaseDate;
};

export async function getCampgroundOutlook(campgroundId: string) {
  const rows = await sqlClient<OutlookRow[]>`
    SELECT cf.target_date, cf.day_offset, cf.score, cf.level, cf.confidence,
           cf.factors, m.version AS model_version, m.model_kind,
           coalesce(r.generated_at, max(cf.created_at) OVER ()) AS generated_at,
           pv.version AS profile_version, pv.data_kind AS profile_kind,
           hp.profile_confidence, hp.archetype, hp.land_cover_type,
           hp.elevation_m, evidence.environmental_result,
           evidence.recent_report_result, evidence.historical_report_result,
           evidence.component_weights, evidence.final_result,
           evidence.confidence_reasons, aggregates.recent_average,
           aggregates.historical_average
    FROM campground_forecasts cf
    JOIN forecast_runs r ON r.id = cf.run_id
    JOIN forecast_models m ON m.id = r.model_id
    JOIN campground_habitat_profiles hp ON hp.id = cf.habitat_profile_id
    JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
    LEFT JOIN campground_forecast_evidence evidence
      ON evidence.forecast_id = cf.id
    LEFT JOIN campground_aggregates aggregates
      ON aggregates.campground_id = cf.campground_id
    WHERE cf.campground_id = ${campgroundId}::uuid
      AND cf.target_date::date >= CURRENT_DATE
      AND r.id = (
        SELECT cf2.run_id FROM campground_forecasts cf2
        JOIN forecast_runs r2 ON r2.id = cf2.run_id
        WHERE cf2.campground_id = ${campgroundId}::uuid
          AND r2.status IN ('running', 'published', 'failed')
          AND r2.is_production = true
          AND cf2.target_date::date >= CURRENT_DATE
        GROUP BY cf2.run_id, r2.generated_at, r2.created_at
        HAVING count(*) >= 8
        ORDER BY r2.generated_at DESC NULLS LAST, r2.created_at DESC
        LIMIT 1
      )
    ORDER BY cf.day_offset
  `;
  if (!rows.length) return null;
  const first = rows[0];
  return {
    modelVersion: first.model_version,
    modelKind: first.model_kind,
    generatedAt: parseDatabaseDate(first.generated_at).toISOString(),
    profile: {
      version: first.profile_version,
      kind: first.profile_kind,
      confidence: first.profile_confidence,
      archetype: first.archetype,
      landCoverType: first.land_cover_type,
      elevationM: first.elevation_m,
    },
    nights: rows.slice(0, 8).map((row, index) => ({
      targetDate: parseDatabaseDate(row.target_date).toISOString(),
      dayOffset: index,
      score: row.score,
      level: row.level,
      confidence: row.confidence,
      factors: row.factors,
      environmentalForecast: row.environmental_result as null | {
        riskIndex: number;
        habitatSuitability: number;
        breedingCondition: number;
        populationPotential: number;
        activityModifier: number;
      },
      recentReports: row.recent_report_result as null | {
        signal: number | null;
        weight: number;
        reportCount: number;
        confidence: number;
        agreement: number;
      },
      historicalReports: row.historical_report_result as null | {
        signal: number | null;
        weight: number;
        reportCount: number;
        representedYears?: number;
        confidence: number;
        agreement: number;
      },
      weights: row.component_weights,
      finalForecast: row.final_result,
      confidenceReasons: row.confidence_reasons || row.factors,
    })),
    observedRatings: {
      past30Days: first.recent_average,
      historical: first.historical_average,
    },
  };
}

export async function getCampgroundMonthlyOutlooks(campgroundId: string) {
  const rows = await sqlClient<MonthlyOutlookRow[]>`
    SELECT mo.target_month, mo.score, mo.level, mo.confidence, mo.factors,
      mo.source_kind, m.version AS model_version, r.generated_at
    FROM campground_monthly_outlooks mo
    JOIN forecast_runs r ON r.id = mo.run_id
    JOIN forecast_models m ON m.id = r.model_id
    WHERE mo.campground_id = ${campgroundId}::uuid
      AND r.status = 'published'
      AND m.model_kind = 'campground-monthly-climatology-seasonal-beta'
      AND r.id = (
        SELECT mo2.run_id FROM campground_monthly_outlooks mo2
        JOIN forecast_runs r2 ON r2.id = mo2.run_id
        WHERE mo2.campground_id = ${campgroundId}::uuid
          AND r2.status = 'published'
        ORDER BY r2.generated_at DESC LIMIT 1
      )
    ORDER BY mo.target_month
  `;
  return rows.map((row) => ({
    targetMonth: parseDatabaseDate(row.target_month).toISOString().slice(0, 7),
    score: row.score,
    level: row.level,
    confidence: row.confidence,
    factors: row.factors,
    sourceKind: row.source_kind,
    modelVersion: row.model_version,
    generatedAt: parseDatabaseDate(row.generated_at).toISOString(),
  }));
}

export async function getCampgroundForecastSchedule(campgroundId: string) {
  const rows = await sqlClient<
    Array<{
      cadence: string;
      reason_codes: string[];
      last_forecast_at: DatabaseDate | null;
    }>
  >`
    SELECT cadence, reason_codes, last_forecast_at
    FROM campground_forecast_schedules
    WHERE campground_id = ${campgroundId}::uuid
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    cadence: row.cadence,
    reasonCodes: row.reason_codes,
    lastForecastAt: row.last_forecast_at
      ? parseDatabaseDate(row.last_forecast_at).toISOString()
      : null,
  };
}
