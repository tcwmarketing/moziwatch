import { decideForecastCadence } from "@/config/forecast-scheduling";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";

type EligibilityRow = {
  campground_id: string;
  active: boolean;
  operating_status: string;
  official_campsites: number | null;
  recent_report: boolean;
  saved_users: number;
  detail_views_30d: number;
  requested_recently: boolean;
  manual_override: "daily" | "weekly" | "paused" | null;
};

export async function syncForecastSchedules() {
  const rows = await sqlClient<EligibilityRow[]>`
    SELECT c.id AS campground_id, c.active, c.operational_status,
      capacity.official_campsites,
      EXISTS (
        SELECT 1 FROM reports r
        WHERE r.campground_id = c.id
          AND r.moderation_status = 'published'
          AND r.deleted_at IS NULL
          AND r.observed_on >= (now() - interval '30 days')::date
      ) AS recent_report,
      (SELECT count(*)::int FROM saved_campgrounds s WHERE s.campground_id = c.id) AS saved_users,
      coalesce((
        SELECT sum(i.detail_views)::int
        FROM campground_forecast_interest_daily i
        WHERE i.campground_id = c.id
          AND i.activity_date >= CURRENT_DATE - interval '29 days'
      ), 0)::int AS detail_views_30d,
      coalesce(existing.daily_until > now(), false) AS requested_recently,
      existing.manual_override
    FROM campgrounds c
    JOIN campground_habitat_profiles hp
      ON hp.campground_id = c.id AND hp.active = true
    LEFT JOIN campground_forecast_schedules existing
      ON existing.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT campsite_count AS official_campsites
      FROM location_source_records lsr
      WHERE lsr.campground_id = c.id AND campsite_count IS NOT NULL
      ORDER BY
        CASE campsite_count_kind
          WHEN 'official_total' THEN 3
          WHEN 'reservable_inventory' THEN 2
          ELSE 1
        END DESC,
        authoritative DESC, source_priority DESC,
        campsite_count_checked_at DESC NULLS LAST
      LIMIT 1
    ) capacity ON true
  `;
  const decisions = rows.map((row) => {
    if (!row.campground_id)
      throw new Error("Forecast schedule query returned no campground id");
    const operatingStatus = row.operating_status || "active";
    const decision = decideForecastCadence({
      active: row.active,
      operatingStatus,
      hasHabitatProfile: true,
      officialCampsites: row.official_campsites,
      recentReport: row.recent_report,
      savedUsers: row.saved_users,
      detailViews30d: row.detail_views_30d,
      requestedRecently: row.requested_recently,
      manualOverride: row.manual_override,
    });
    return {
      campground_id: row.campground_id,
      cadence: decision.cadence,
      priority_score: decision.priorityScore,
      reason_codes: decision.reasonCodes,
      operating_status: operatingStatus,
    };
  });

  // One set-based upsert per 500 campgrounds keeps the Supabase pooler load
  // bounded and avoids tens of thousands of individual network round trips.
  for (let offset = 0; offset < decisions.length; offset += 500) {
    const batch = decisions.slice(offset, offset + 500);
    await sqlClient`
      WITH input AS (
        SELECT *
        FROM jsonb_to_recordset(${toPostgresJson(batch)}::jsonb) AS item(
          campground_id text,
          cadence text,
          priority_score integer,
          reason_codes jsonb,
          operating_status text
        )
      )
      INSERT INTO campground_forecast_schedules (
        campground_id, cadence, priority_score, reason_codes,
        next_refresh_at, operating_status
      )
      SELECT
        campground_id::uuid,
        cadence::forecast_cadence,
        priority_score,
        reason_codes,
        CASE
          WHEN cadence = 'paused' THEN NULL
          WHEN cadence = 'weekly' THEN
            now() + (
              mod(abs(hashtextextended(campground_id, 0)), 10080)
              * interval '1 minute'
            )
          ELSE now()
        END,
        operating_status
      FROM input
      ON CONFLICT (campground_id) DO UPDATE SET
        cadence = excluded.cadence,
        priority_score = excluded.priority_score,
        reason_codes = excluded.reason_codes,
        operating_status = excluded.operating_status,
        next_refresh_at = CASE
          WHEN excluded.cadence = 'paused' THEN NULL
          WHEN campground_forecast_schedules.cadence <> excluded.cadence
            THEN excluded.next_refresh_at
          ELSE campground_forecast_schedules.next_refresh_at
        END,
        updated_at = now()
    `;
  }
  return rows.length;
}

export async function markForecastSchedulesPublished(campgroundIds: string[]) {
  if (!campgroundIds.length) return;
  await sqlClient`
    UPDATE campground_forecast_schedules SET
      last_forecast_at = now(),
      next_refresh_at = CASE
        WHEN cadence = 'daily' THEN now() + interval '1 day'
        WHEN cadence = 'weekly' THEN now() + interval '7 days'
        ELSE NULL
      END,
      updated_at = now()
    WHERE campground_id = ANY(${campgroundIds}::uuid[])
  `;
}
