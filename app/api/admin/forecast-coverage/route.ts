import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";

export const dynamic = "force-dynamic";

type CoverageRow = {
  name: string;
  slug: string;
  city: string | null;
  region: string | null;
  country: string;
  cadence: string;
  priority_score: number;
  official_campsites: number | null;
  profile_version: string;
  profile_kind: string;
  forecast_status: "current" | "pending";
  model_version: string | null;
  generated_at: Date | string | null;
};

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  if (!(await getApiAdmin(request))) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await sqlClient<CoverageRow[]>`
    WITH latest_outlook AS (
      SELECT DISTINCT ON (cf.campground_id)
        cf.campground_id, m.version AS model_version, r.generated_at
      FROM campground_forecasts cf
      JOIN forecast_runs r ON r.id = cf.run_id
      JOIN forecast_models m ON m.id = r.model_id
      WHERE r.is_production = true
        AND r.status IN ('running', 'published', 'failed')
        AND cf.target_date::date >= CURRENT_DATE
      ORDER BY cf.campground_id, r.generated_at DESC NULLS LAST,
        r.created_at DESC
    )
    SELECT c.name, c.slug, c.city, c.region, c.country,
      schedules.cadence, schedules.priority_score,
      capacity.official_campsites,
      versions.version AS profile_version,
      versions.data_kind AS profile_kind,
      CASE WHEN latest_outlook.campground_id IS NULL
        THEN 'pending' ELSE 'current' END AS forecast_status,
      latest_outlook.model_version, latest_outlook.generated_at
    FROM campgrounds c
    JOIN campground_habitat_profiles profiles
      ON profiles.campground_id = c.id AND profiles.active = true
    JOIN habitat_profile_versions versions
      ON versions.id = profiles.profile_version_id
    JOIN campground_forecast_schedules schedules
      ON schedules.campground_id = c.id
    LEFT JOIN latest_outlook ON latest_outlook.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT source.campsite_count AS official_campsites
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
    WHERE c.active = true
    ORDER BY
      CASE schedules.cadence WHEN 'daily' THEN 0 ELSE 1 END,
      schedules.priority_score DESC,
      capacity.official_campsites DESC NULLS LAST, c.name
    LIMIT 5000
  `;

  const header = [
    "Campground",
    "Page",
    "City",
    "Region",
    "Country",
    "Forecast cadence",
    "Priority score",
    "Official campsites",
    "Habitat profile version",
    "Habitat profile kind",
    "Forecast status",
    "Forecast model",
    "Forecast generated at",
  ];
  const body = rows.map((row) =>
    [
      row.name,
      `/campgrounds/${row.slug}`,
      row.city,
      row.region,
      row.country,
      row.cadence,
      row.priority_score,
      row.official_campsites,
      row.profile_version,
      row.profile_kind,
      row.forecast_status,
      row.model_version,
      row.generated_at,
    ]
      .map(csvCell)
      .join(","),
  );

  return new Response([header.map(csvCell).join(","), ...body].join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="moziwatch-forecast-coverage.csv"',
      "Cache-Control": "private, no-store",
    },
  });
}
