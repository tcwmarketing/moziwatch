import { sqlClient } from "@/db";
import { markerStateForAverage } from "@/config/ratings";
import {
  MAP_CLUSTER_MAX_ZOOM,
  mapClusterCellSizeDegrees,
  shouldGroupMapLocations,
  type MapLocationScope,
} from "./map-query";
import { parseDatabaseDate, type DatabaseDate } from "./database-date";

export { MAP_CLUSTER_MAX_ZOOM, mapClusterCellSizeDegrees } from "./map-query";

export type RatingPeriod = "recent" | "historical";
export type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type CampgroundRow = {
  id: string;
  name: string;
  slug: string;
  location_type:
    | "developed_campground"
    | "rv_park"
    | "backcountry_campground"
    | "group_campground"
    | "other_established_campground";
  data_source: string;
  verification_status:
    "unverified" | "source_verified" | "owner_verified" | "manually_verified";
  preferred_source: string | null;
  official_campsite_count: number | null;
  campsite_count_kind:
    "official_total" | "reservable_inventory" | "mapped_capacity" | null;
  campsite_count_source: string | null;
  maintenance_status: string | null;
  facility_values: Array<string | null> | null;
  address: string;
  city: string;
  region: string;
  country: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  website: string | null;
  recent_average: number | null;
  recent_count: number;
  historical_average: number | null;
  historical_count: number;
  most_recent_report_at: DatabaseDate | null;
  report_summary_phrases: string[];
  report_summary_report_count: number;
  forecast_score: number | null;
  forecast_level: string | null;
  forecast_confidence: number | null;
  forecast_target_date: DatabaseDate | null;
  forecast_model_version: string | null;
  forecast_profile_kind: string | null;
};

type MapCampgroundRow = Pick<
  CampgroundRow,
  | "id"
  | "name"
  | "slug"
  | "city"
  | "region"
  | "country"
  | "latitude"
  | "longitude"
  | "recent_average"
  | "recent_count"
  | "historical_average"
  | "historical_count"
  | "forecast_score"
  | "forecast_level"
  | "forecast_confidence"
>;

type MapClusterRow = {
  longitude: number;
  latitude: number;
  point_count: number;
  campground_ids: string[];
};

function abbreviatedCount(value: number) {
  return new Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

const LOCATION_TYPE_LABELS: Record<CampgroundRow["location_type"], string> = {
  developed_campground: "Developed campground",
  rv_park: "RV park",
  backcountry_campground: "Backcountry campground",
  group_campground: "Group campground",
  other_established_campground: "Rustic recreation-site campground",
};

const SOURCE_LABELS: Record<string, string> = {
  "bc-recreation": "Recreation Sites and Trails BC",
  "bc-parks": "BC Parks",
  openstreetmap: "OpenStreetMap",
  ridb: "Recreation Information Database",
  nps: "National Park Service",
  usfs: "USDA Forest Service",
  "overture-ca": "Overture Maps Foundation",
  "overture-us": "Overture Maps Foundation",
  administrator: "Moziwatch administrator",
};

export function campgroundLocationTypeLabel(
  type: CampgroundRow["location_type"],
) {
  return LOCATION_TYPE_LABELS[type];
}

function toMapFeatures(rows: MapCampgroundRow[], period: RatingPeriod) {
  return rows.map((row) => {
    const selectedAverage =
      period === "recent" ? row.recent_average : row.historical_average;
    const marker = markerStateForAverage(selectedAverage);
    return {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [row.longitude, row.latitude],
      },
      properties: {
        id: row.id,
        name: row.name,
        slug: row.slug,
        city: row.city,
        region: row.region,
        country: row.country,
        recent_average: row.recent_average,
        recent_count: row.recent_count,
        historical_average: row.historical_average,
        historical_count: row.historical_count,
        forecast_score: row.forecast_score,
        forecast_level: row.forecast_level,
        forecast_confidence: row.forecast_confidence,
        selected_period: period,
        selected_average: selectedAverage,
        selected_count:
          period === "recent" ? row.recent_count : row.historical_count,
        severity_key: marker.key,
        severity_label: marker.label,
        marker_color: marker.color,
      },
    };
  });
}

function toClusterFeatures(rows: MapClusterRow[]) {
  return rows.map((row, index) => ({
    type: "Feature" as const,
    geometry: {
      type: "Point" as const,
      coordinates: [Number(row.longitude), Number(row.latitude)],
    },
    properties: {
      server_cluster: true,
      cluster_id: `server-${index}`,
      point_count: Number(row.point_count),
      point_count_abbreviated: abbreviatedCount(Number(row.point_count)),
    },
  }));
}

function toFeatures(rows: CampgroundRow[], period: RatingPeriod) {
  return rows.map((row) => {
    const { facility_values: facilityValues, ...publicRow } = row;
    const selectedAverage =
      period === "recent" ? row.recent_average : row.historical_average;
    const marker = markerStateForAverage(selectedAverage);
    const facilities = [
      ...new Set(
        (facilityValues || []).filter(
          (value): value is string => Boolean(value) && value !== "NULL",
        ),
      ),
    ].slice(0, 5);
    return {
      type: "Feature" as const,
      geometry: {
        type: "Point" as const,
        coordinates: [row.longitude, row.latitude],
      },
      properties: {
        ...publicRow,
        location_type_label: campgroundLocationTypeLabel(row.location_type),
        source_label:
          SOURCE_LABELS[row.preferred_source || row.data_source] ||
          row.preferred_source ||
          row.data_source,
        facilities_summary: facilities.join(", ") || null,
        selected_period: period,
        selected_average: selectedAverage,
        selected_count:
          period === "recent" ? row.recent_count : row.historical_count,
        severity_key: marker.key,
        severity_label: marker.label,
        marker_color: marker.color,
        most_recent_report_at: row.most_recent_report_at
          ? parseDatabaseDate(row.most_recent_report_at).toISOString()
          : null,
        forecast_target_date: row.forecast_target_date
          ? parseDatabaseDate(row.forecast_target_date).toISOString()
          : null,
      },
    };
  });
}

export async function listCampgrounds(
  period: RatingPeriod,
  bounds?: MapBounds,
  query?: string,
  zoom = MAP_CLUSTER_MAX_ZOOM + 1,
  scope: MapLocationScope = "verified",
) {
  const scopeFilter =
    scope === "all" ? "" : "AND c.verification_status <> 'unverified'";
  const select = `SELECT c.id, c.name, c.slug, c.city, c.region, c.country,
           c.latitude, c.longitude,
           a.recent_average, coalesce(a.recent_count, 0)::int AS recent_count,
           a.historical_average, coalesce(a.historical_count, 0)::int AS historical_count,
           f.score AS forecast_score, f.level AS forecast_level,
           f.confidence AS forecast_confidence
    FROM campgrounds c
    LEFT JOIN campground_aggregates a ON a.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT cf.score, cf.level, cf.confidence
      FROM campground_forecasts cf
      JOIN forecast_runs r ON r.id = cf.run_id
      JOIN forecast_models m ON m.id = r.model_id
      WHERE cf.campground_id = c.id
        AND cf.target_date >= CURRENT_DATE
        AND cf.target_date < CURRENT_DATE + interval '1 day'
        AND r.status = 'published'
        AND r.is_production = true
        AND m.model_kind IN ('campground-habitat-weather-beta', 'campground-weather-habitat-report-index')
      ORDER BY r.generated_at DESC LIMIT 1
    ) f ON true`;
  if (!query?.trim() && bounds && zoom <= MAP_CLUSTER_MAX_ZOOM) {
    const cellSize = mapClusterCellSizeDegrees(zoom);
    const rows = await sqlClient.unsafe<MapClusterRow[]>(
      `SELECT avg(c.longitude)::float8 AS longitude,
              avg(c.latitude)::float8 AS latitude,
              count(*)::int AS point_count,
              array_agg(c.id::text ORDER BY c.id) AS campground_ids
       FROM campgrounds c
       WHERE c.active = true
         AND c.operational_status <> 'closed'
         ${scopeFilter}
         AND c.point && extensions.st_makeenvelope($1, $2, $3, $4, 4326)
       GROUP BY floor((c.longitude + 180) / $5),
                floor((c.latitude + 90) / $5)`,
      [bounds.west, bounds.south, bounds.east, bounds.north, cellSize],
    );
    const groupedRows = rows.filter((row) =>
      shouldGroupMapLocations(Number(row.point_count)),
    );
    const individualIds = rows
      .filter((row) => !shouldGroupMapLocations(Number(row.point_count)))
      .flatMap((row) => row.campground_ids);
    if (!individualIds.length) return toClusterFeatures(groupedRows);
    const individualRows = await sqlClient.unsafe<MapCampgroundRow[]>(
      `${select} WHERE c.id = ANY($1::uuid[])
        ORDER BY c.name LIMIT 5000`,
      [individualIds],
    );
    return [
      ...toClusterFeatures(groupedRows),
      ...toMapFeatures(individualRows, period),
    ];
  }
  let rows: MapCampgroundRow[];
  if (query?.trim()) {
    const term = `%${query.trim()}%`;
    if (bounds) {
      rows = await sqlClient.unsafe<MapCampgroundRow[]>(
        `${select} WHERE c.active = true AND c.operational_status <> 'closed'
          ${scopeFilter}
          AND c.point && extensions.st_makeenvelope($2, $3, $4, $5, 4326)
          AND (c.name || ' ' || c.city || ' ' || c.region) ILIKE $1
          ORDER BY c.name LIMIT 250`,
        [term, bounds.west, bounds.south, bounds.east, bounds.north],
      );
    } else {
      rows = await sqlClient.unsafe<MapCampgroundRow[]>(
        `${select} WHERE c.active = true AND c.operational_status <> 'closed'
          ${scopeFilter}
          AND (c.name || ' ' || c.city || ' ' || c.region) ILIKE $1
          ORDER BY c.name LIMIT 100`,
        [term],
      );
    }
  } else if (bounds) {
    rows = await sqlClient.unsafe<MapCampgroundRow[]>(
      `${select} WHERE c.active = true AND c.operational_status <> 'closed'
        ${scopeFilter}
        AND c.point && extensions.st_makeenvelope($1, $2, $3, $4, 4326)
        ORDER BY c.name LIMIT 5000`,
      [bounds.west, bounds.south, bounds.east, bounds.north],
    );
  } else {
    rows = [];
  }
  return toMapFeatures(rows, period);
}

export async function listAllCampgroundsForMaintenance(period: RatingPeriod) {
  const rows = await sqlClient<CampgroundRow[]>`
    SELECT c.id, c.name, c.slug, c.location_type, c.data_source,
           c.verification_status,
           loc.source AS preferred_source,
           capacity.campsite_count AS official_campsite_count,
           capacity.campsite_count_kind, capacity.source AS campsite_count_source,
           loc.maintenance_status, loc.facility_values,
           c.address, c.city, c.region, c.country,
           c.postal_code, c.latitude, c.longitude, c.website,
           a.recent_average, coalesce(a.recent_count, 0)::int AS recent_count,
           a.historical_average, coalesce(a.historical_count, 0)::int AS historical_count,
           a.most_recent_report_at,
           coalesce(a.report_summary_phrases, ARRAY[]::text[]) AS report_summary_phrases,
           coalesce(a.report_summary_report_count, 0)::int AS report_summary_report_count,
           f.score AS forecast_score, f.level AS forecast_level,
           f.confidence AS forecast_confidence,
           f.target_date AS forecast_target_date,
           fm.version AS forecast_model_version,
           fpv.data_kind AS forecast_profile_kind
    FROM campgrounds c
    LEFT JOIN LATERAL (
      SELECT source,
        nullif(raw_payload->>'MAINTAIN_STD_DESC', '') AS maintenance_status,
        CASE WHEN jsonb_typeof(raw_payload->'facilityLabels') = 'array'
          THEN ARRAY(
            SELECT jsonb_array_elements_text(raw_payload->'facilityLabels')
          )
          ELSE ARRAY[
            raw_payload->>'STRUCTURE_DESC1', raw_payload->>'STRUCTURE_DESC2',
            raw_payload->>'STRUCTURE_DESC3', raw_payload->>'STRUCTURE_DESC4',
            raw_payload->>'STRUCTURE_DESC5', raw_payload->>'STRUCTURE_DESC6',
            raw_payload->>'STRUCTURE_DESC7', raw_payload->>'STRUCTURE_DESC8',
            raw_payload->>'STRUCTURE_DESC9', raw_payload->>'STRUCTURE_DESC10'
          ]
        END AS facility_values
      FROM location_source_records
      WHERE campground_id = c.id
      ORDER BY source_priority DESC, updated_at DESC
      LIMIT 1
    ) loc ON true
    LEFT JOIN LATERAL (
      SELECT campsite_count, campsite_count_kind, source
      FROM location_source_records
      WHERE campground_id = c.id AND campsite_count IS NOT NULL
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
    LEFT JOIN campground_aggregates a ON a.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT cf.* FROM campground_forecasts cf
      JOIN forecast_runs r ON r.id = cf.run_id
      JOIN forecast_models m ON m.id = r.model_id
      WHERE cf.campground_id = c.id
        AND cf.target_date::date = CURRENT_DATE
        AND r.status = 'published'
        AND r.is_production = true
        AND m.model_kind IN ('campground-habitat-weather-beta', 'campground-weather-habitat-report-index')
      ORDER BY r.generated_at DESC LIMIT 1
    ) f ON true
    LEFT JOIN forecast_models fm ON fm.id = (
      SELECT model_id FROM forecast_runs WHERE id = f.run_id
    )
    LEFT JOIN campground_habitat_profiles fhp ON fhp.id = f.habitat_profile_id
    LEFT JOIN habitat_profile_versions fpv ON fpv.id = fhp.profile_version_id
    WHERE c.active = true
    ORDER BY c.name
  `;
  return toFeatures(rows, period);
}

export async function getCampgroundBySlug(slug: string) {
  const rows = await sqlClient<CampgroundRow[]>`
    SELECT c.id, c.name, c.slug, c.location_type, c.data_source,
           c.verification_status,
           loc.source AS preferred_source,
           capacity.campsite_count AS official_campsite_count,
           capacity.campsite_count_kind, capacity.source AS campsite_count_source,
           loc.maintenance_status, loc.facility_values,
           c.address, c.city, c.region, c.country,
           c.postal_code, c.latitude, c.longitude, c.website,
           a.recent_average, coalesce(a.recent_count, 0)::int AS recent_count,
           a.historical_average, coalesce(a.historical_count, 0)::int AS historical_count,
           a.most_recent_report_at,
           coalesce(a.report_summary_phrases, ARRAY[]::text[]) AS report_summary_phrases,
           coalesce(a.report_summary_report_count, 0)::int AS report_summary_report_count,
           f.score AS forecast_score, f.level AS forecast_level,
           f.confidence AS forecast_confidence,
           f.target_date AS forecast_target_date,
           fm.version AS forecast_model_version,
           fpv.data_kind AS forecast_profile_kind
    FROM campgrounds c
    LEFT JOIN LATERAL (
      SELECT source,
        nullif(raw_payload->>'MAINTAIN_STD_DESC', '') AS maintenance_status,
        CASE WHEN jsonb_typeof(raw_payload->'facilityLabels') = 'array'
          THEN ARRAY(
            SELECT jsonb_array_elements_text(raw_payload->'facilityLabels')
          )
          ELSE ARRAY[
            raw_payload->>'STRUCTURE_DESC1', raw_payload->>'STRUCTURE_DESC2',
            raw_payload->>'STRUCTURE_DESC3', raw_payload->>'STRUCTURE_DESC4',
            raw_payload->>'STRUCTURE_DESC5', raw_payload->>'STRUCTURE_DESC6',
            raw_payload->>'STRUCTURE_DESC7', raw_payload->>'STRUCTURE_DESC8',
            raw_payload->>'STRUCTURE_DESC9', raw_payload->>'STRUCTURE_DESC10'
          ]
        END AS facility_values
      FROM location_source_records
      WHERE campground_id = c.id
      ORDER BY source_priority DESC, updated_at DESC
      LIMIT 1
    ) loc ON true
    LEFT JOIN LATERAL (
      SELECT campsite_count, campsite_count_kind, source
      FROM location_source_records
      WHERE campground_id = c.id AND campsite_count IS NOT NULL
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
    LEFT JOIN campground_aggregates a ON a.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT cf.* FROM campground_forecasts cf
      JOIN forecast_runs r ON r.id = cf.run_id
      JOIN forecast_models m ON m.id = r.model_id
      WHERE cf.campground_id = c.id
        AND cf.target_date::date = CURRENT_DATE
        AND r.status = 'published'
        AND r.is_production = true
        AND m.model_kind IN ('campground-habitat-weather-beta', 'campground-weather-habitat-report-index')
      ORDER BY r.generated_at DESC LIMIT 1
    ) f ON true
    LEFT JOIN forecast_models fm ON fm.id = (
      SELECT model_id FROM forecast_runs WHERE id = f.run_id
    )
    LEFT JOIN campground_habitat_profiles fhp ON fhp.id = f.habitat_profile_id
    LEFT JOIN habitat_profile_versions fpv ON fpv.id = fhp.profile_version_id
    WHERE c.slug = ${slug} AND c.active = true LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getCampgroundMapDetail(
  campgroundId: string,
  period: RatingPeriod,
) {
  const rows = await sqlClient<CampgroundRow[]>`
    SELECT c.id, c.name, c.slug, c.location_type, c.data_source,
           c.verification_status,
           loc.source AS preferred_source,
           capacity.campsite_count AS official_campsite_count,
           capacity.campsite_count_kind, capacity.source AS campsite_count_source,
           loc.maintenance_status, loc.facility_values,
           c.address, c.city, c.region, c.country,
           c.postal_code, c.latitude, c.longitude, c.website,
           a.recent_average, coalesce(a.recent_count, 0)::int AS recent_count,
           a.historical_average, coalesce(a.historical_count, 0)::int AS historical_count,
           a.most_recent_report_at,
           coalesce(a.report_summary_phrases, ARRAY[]::text[]) AS report_summary_phrases,
           coalesce(a.report_summary_report_count, 0)::int AS report_summary_report_count,
           f.score AS forecast_score, f.level AS forecast_level,
           f.confidence AS forecast_confidence,
           f.target_date AS forecast_target_date,
           fm.version AS forecast_model_version,
           fpv.data_kind AS forecast_profile_kind
    FROM campgrounds c
    LEFT JOIN LATERAL (
      SELECT source,
        nullif(raw_payload->>'MAINTAIN_STD_DESC', '') AS maintenance_status,
        CASE WHEN jsonb_typeof(raw_payload->'facilityLabels') = 'array'
          THEN ARRAY(
            SELECT jsonb_array_elements_text(raw_payload->'facilityLabels')
          )
          ELSE ARRAY[
            raw_payload->>'STRUCTURE_DESC1', raw_payload->>'STRUCTURE_DESC2',
            raw_payload->>'STRUCTURE_DESC3', raw_payload->>'STRUCTURE_DESC4',
            raw_payload->>'STRUCTURE_DESC5', raw_payload->>'STRUCTURE_DESC6',
            raw_payload->>'STRUCTURE_DESC7', raw_payload->>'STRUCTURE_DESC8',
            raw_payload->>'STRUCTURE_DESC9', raw_payload->>'STRUCTURE_DESC10'
          ]
        END AS facility_values
      FROM location_source_records
      WHERE campground_id = c.id
      ORDER BY source_priority DESC, updated_at DESC
      LIMIT 1
    ) loc ON true
    LEFT JOIN LATERAL (
      SELECT campsite_count, campsite_count_kind, source
      FROM location_source_records
      WHERE campground_id = c.id AND campsite_count IS NOT NULL
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
    LEFT JOIN campground_aggregates a ON a.campground_id = c.id
    LEFT JOIN LATERAL (
      SELECT cf.* FROM campground_forecasts cf
      JOIN forecast_runs r ON r.id = cf.run_id
      JOIN forecast_models m ON m.id = r.model_id
      WHERE cf.campground_id = c.id
        AND cf.target_date >= CURRENT_DATE
        AND cf.target_date < CURRENT_DATE + interval '1 day'
        AND r.status = 'published'
        AND r.is_production = true
        AND m.model_kind IN ('campground-habitat-weather-beta', 'campground-weather-habitat-report-index')
      ORDER BY r.generated_at DESC LIMIT 1
    ) f ON true
    LEFT JOIN forecast_models fm ON fm.id = (
      SELECT model_id FROM forecast_runs WHERE id = f.run_id
    )
    LEFT JOIN campground_habitat_profiles fhp ON fhp.id = f.habitat_profile_id
    LEFT JOIN habitat_profile_versions fpv ON fpv.id = fhp.profile_version_id
    WHERE c.id = ${campgroundId}::uuid AND c.active = true LIMIT 1
  `;
  return toFeatures(rows, period)[0]?.properties ?? null;
}

export async function getCampgroundReports(campgroundId: string) {
  const [reports, distribution] = await Promise.all([
    sqlClient<
      {
        id: string;
        rating: number;
        comment: string | null;
        submitted_at: DatabaseDate;
        observed_on: DatabaseDate;
        account_report: boolean;
      }[]
    >`
      SELECT id, rating, comment, submitted_at, observed_on,
        (account_id IS NOT NULL) AS account_report
      FROM reports WHERE campground_id = ${campgroundId}::uuid
        AND moderation_status = 'published' AND deleted_at IS NULL
      ORDER BY observed_on DESC, submitted_at DESC LIMIT 50
    `,
    sqlClient<{ rating: number; count: number }[]>`
      SELECT rating, count(*)::int AS count FROM reports
      WHERE campground_id = ${campgroundId}::uuid
        AND moderation_status = 'published' AND deleted_at IS NULL
      GROUP BY rating ORDER BY rating
    `,
  ]);
  return {
    reports: reports.map((report) => ({
      ...report,
      submitted_at: parseDatabaseDate(report.submitted_at),
      observed_on: parseDatabaseDate(report.observed_on),
    })),
    distribution,
  };
}
