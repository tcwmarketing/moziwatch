import { sqlClient } from "@/db";
import { markerStateForAverage } from "@/config/ratings";

export type RatingPeriod = "recent" | "historical";

type CampgroundRow = {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  region: string;
  country: string;
  postal_code: string;
  latitude: number;
  longitude: number;
  description: string | null;
  website: string | null;
  recent_average: number | null;
  recent_count: number;
  historical_average: number | null;
  historical_count: number;
  most_recent_report_at: Date | null;
};

export async function listCampgrounds(period: RatingPeriod) {
  const rows = await sqlClient<CampgroundRow[]>`
    SELECT c.id, c.name, c.slug, c.address, c.city, c.region, c.country,
           c.postal_code, c.latitude, c.longitude, c.description, c.website,
           a.recent_average, coalesce(a.recent_count, 0)::int AS recent_count,
           a.historical_average, coalesce(a.historical_count, 0)::int AS historical_count,
           a.most_recent_report_at
    FROM campgrounds c
    LEFT JOIN campground_aggregates a ON a.campground_id = c.id
    WHERE c.active = true
    ORDER BY c.name
  `;
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
        ...row,
        selected_period: period,
        selected_average: selectedAverage,
        selected_count:
          period === "recent" ? row.recent_count : row.historical_count,
        severity_key: marker.key,
        severity_label: marker.label,
        marker_color: marker.color,
        most_recent_report_at: row.most_recent_report_at?.toISOString() ?? null,
      },
    };
  });
}

export async function getCampgroundBySlug(slug: string) {
  const rows = await sqlClient<CampgroundRow[]>`
    SELECT c.id, c.name, c.slug, c.address, c.city, c.region, c.country,
           c.postal_code, c.latitude, c.longitude, c.description, c.website,
           a.recent_average, coalesce(a.recent_count, 0)::int AS recent_count,
           a.historical_average, coalesce(a.historical_count, 0)::int AS historical_count,
           a.most_recent_report_at
    FROM campgrounds c LEFT JOIN campground_aggregates a ON a.campground_id = c.id
    WHERE c.slug = ${slug} AND c.active = true LIMIT 1
  `;
  return rows[0] ?? null;
}

export async function getCampgroundReports(campgroundId: string) {
  const [reports, distribution] = await Promise.all([
    sqlClient<
      {
        id: string;
        rating: number;
        comment: string | null;
        submitted_at: Date;
        account_report: boolean;
      }[]
    >`
      SELECT id, rating, comment, submitted_at, (account_id IS NOT NULL) AS account_report
      FROM reports WHERE campground_id = ${campgroundId}::uuid
        AND moderation_status = 'published' AND deleted_at IS NULL
      ORDER BY submitted_at DESC LIMIT 50
    `,
    sqlClient<{ rating: number; count: number }[]>`
      SELECT rating, count(*)::int AS count FROM reports
      WHERE campground_id = ${campgroundId}::uuid
        AND moderation_status = 'published' AND deleted_at IS NULL
      GROUP BY rating ORDER BY rating
    `,
  ]);
  return { reports, distribution };
}
