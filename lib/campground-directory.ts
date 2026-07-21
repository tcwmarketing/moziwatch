import "server-only";
import { sqlClient } from "@/db";
import { markerStateForAverage } from "@/config/ratings";

export const MAJOR_CAMPGROUND_SITE_COUNT = 50;
export const CAMPGROUND_DIRECTORY_PAGE_SIZE = 24;

export type DirectoryPeriod = "recent" | "historical";
export type DirectorySort =
  | "severity_asc"
  | "severity_desc"
  | "distance_asc"
  | "name_asc"
  | "reports_desc";

export type CampgroundDirectoryFilters = {
  query: string;
  scope: "major" | "all";
  period: DirectoryPeriod;
  sort: DirectorySort;
  country: "CA" | "US" | "all";
  region: string;
  locationType: string;
  severity: string;
  forecast: "all" | "available" | "unavailable";
  latitude: number | null;
  longitude: number | null;
  page: number;
};

type DirectoryRow = {
  id: string;
  name: string;
  slug: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  location_type: string;
  official_campsite_count: number | null;
  selected_average: number | null;
  selected_count: number;
  forecast_available: boolean;
  distance_meters: number | null;
  total_count: number;
};

type RegionRow = { region: string };

function distanceMeters(
  latitude: number,
  longitude: number,
  targetLatitude: number,
  targetLongitude: number,
) {
  const radians = (value: number) => (value * Math.PI) / 180;
  const dLatitude = radians(targetLatitude - latitude);
  const dLongitude = radians(targetLongitude - longitude);
  const first = radians(latitude);
  const second = radians(targetLatitude);
  const a =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(first) * Math.cos(second) * Math.sin(dLongitude / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Keep filtering, ordering and pagination in PostgreSQL. The previous
 * implementation hydrated every verified campground and several lateral
 * lookups before discarding all but 24 rows in Node.
 */
export async function getCampgroundDirectory(
  filters: CampgroundDirectoryFilters,
) {
  const offset = (filters.page - 1) * CAMPGROUND_DIRECTORY_PAGE_SIZE;
  const hasLocation = filters.latitude !== null && filters.longitude !== null;
  const params = [
    filters.period,
    filters.query.trim(),
    filters.scope,
    MAJOR_CAMPGROUND_SITE_COUNT,
    filters.country,
    filters.region,
    filters.locationType,
    filters.severity,
    filters.forecast,
    filters.sort,
    hasLocation,
    filters.longitude ?? 0,
    filters.latitude ?? 0,
    CAMPGROUND_DIRECTORY_PAGE_SIZE,
    offset,
  ];

  const [rows, regionRows] = await Promise.all([
    sqlClient.unsafe<DirectoryRow[]>(
      `WITH base AS (
         SELECT c.id, c.name, c.slug, c.city, c.region, c.country,
           c.latitude, c.longitude,
           c.location_type,
           CASE WHEN $1 = 'recent'
             THEN a.recent_average ELSE a.historical_average
           END::double precision AS selected_average,
           CASE WHEN $1 = 'recent'
             THEN coalesce(a.recent_count, 0)
             ELSE coalesce(a.historical_count, 0)
           END::int AS selected_count,
           CASE WHEN $9 <> 'all' THEN EXISTS (
             SELECT 1
             FROM campground_forecasts cf
             JOIN forecast_runs fr ON fr.id = cf.run_id
             WHERE cf.campground_id = c.id
               AND fr.status = 'published' AND fr.is_production = true
           ) ELSE false END AS forecast_available
         FROM campgrounds c
         LEFT JOIN campground_aggregates a ON a.campground_id = c.id
         WHERE c.active = true
           AND c.operational_status <> 'closed'
           AND c.verification_status <> 'unverified'
           AND ($2 = '' OR (c.name || ' ' || c.city || ' ' || c.region) ILIKE '%' || $2 || '%')
           AND ($3 = 'all' OR coalesce((
             SELECT lsr.campsite_count
             FROM location_source_records lsr
             WHERE lsr.campground_id = c.id
               AND lsr.campsite_count IS NOT NULL
             ORDER BY
               CASE lsr.campsite_count_kind
                 WHEN 'official_total' THEN 3
                 WHEN 'reservable_inventory' THEN 2
                 ELSE 1
               END DESC,
               lsr.authoritative DESC, lsr.source_priority DESC,
               lsr.campsite_count_checked_at DESC NULLS LAST
             LIMIT 1
           ), 0) >= $4::int)
           AND ($5 = 'all' OR c.country = $5)
           AND ($6 = '' OR c.region = $6)
           AND ($7 = '' OR c.location_type::text = $7)
       ), filtered AS (
         SELECT *, CASE
           WHEN selected_average IS NULL THEN 'none'
           WHEN selected_average < 2.5 THEN 'low'
           WHEN selected_average < 3.5 THEN 'moderate'
           WHEN selected_average < 4.5 THEN 'high'
           ELSE 'severe'
         END AS severity_key
         FROM base
       )
       SELECT id, name, slug, city, region, country, latitude, longitude,
         location_type,
         (
           SELECT lsr.campsite_count
           FROM location_source_records lsr
           WHERE lsr.campground_id = filtered.id
             AND lsr.campsite_count IS NOT NULL
           ORDER BY
             CASE lsr.campsite_count_kind
               WHEN 'official_total' THEN 3
               WHEN 'reservable_inventory' THEN 2
               ELSE 1
             END DESC,
             lsr.authoritative DESC, lsr.source_priority DESC,
             lsr.campsite_count_checked_at DESC NULLS LAST
           LIMIT 1
         ) AS official_campsite_count,
         selected_average, selected_count,
         forecast_available, NULL::double precision AS distance_meters,
         count(*) OVER ()::int AS total_count
       FROM filtered
       WHERE ($8 = '' OR severity_key = $8)
         AND ($9 = 'all'
           OR ($9 = 'available' AND forecast_available)
           OR ($9 = 'unavailable' AND NOT forecast_available))
       ORDER BY
         CASE WHEN $10 = 'distance_asc' AND $11::boolean THEN
           power(cast(latitude as double precision) - $13::double precision, 2)
           + power(
             (cast(longitude as double precision) - $12::double precision)
             * cos(radians($13::double precision)),
             2
           )
         END ASC NULLS LAST,
         CASE WHEN $10 = 'severity_asc' THEN selected_average END ASC NULLS LAST,
         CASE WHEN $10 = 'severity_desc' THEN selected_average END DESC NULLS LAST,
         CASE WHEN $10 = 'reports_desc' THEN selected_count END DESC NULLS LAST,
         CASE WHEN $10 = 'name_asc' THEN name END ASC NULLS LAST,
         name ASC, id ASC
       LIMIT $14::int OFFSET $15::int`,
      params,
    ),
    sqlClient<RegionRow[]>`
      SELECT DISTINCT region
      FROM campgrounds
      WHERE active = true AND operational_status <> 'closed'
        AND verification_status <> 'unverified'
        AND region <> 'Unknown'
      ORDER BY region
    `,
  ]);

  const total = rows[0]?.total_count ?? 0;
  const pageCount = Math.max(
    1,
    Math.ceil(total / CAMPGROUND_DIRECTORY_PAGE_SIZE),
  );
  return {
    rows: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      city: row.city,
      region: row.region,
      country: row.country,
      location_type: row.location_type,
      official_campsite_count: row.official_campsite_count,
      selected_average: row.selected_average,
      selected_count: row.selected_count,
      forecast_available: row.forecast_available,
      distance_meters: hasLocation
        ? distanceMeters(
            Number(row.latitude),
            Number(row.longitude),
            filters.latitude!,
            filters.longitude!,
          )
        : null,
      severity: markerStateForAverage(row.selected_average),
    })),
    total,
    page: Math.min(filters.page, pageCount),
    pageCount,
    regions: regionRows.map((row) => row.region),
  };
}
