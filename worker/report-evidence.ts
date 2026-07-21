import type { ForecastReport } from "@/config/forecast-v3";
import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";

type ReportRow = {
  id: string;
  campground_id: string;
  rating: number;
  observed_on: DatabaseDate;
  submitted_at: DatabaseDate;
  account_id: string | null;
  email_verified: boolean | null;
  moderation_status: ForecastReport["moderationStatus"];
  deleted_at: DatabaseDate | null;
};

export async function loadForecastReports(
  campgroundIds: string[],
  generatedAt: Date,
) {
  const grouped = new Map<string, ForecastReport[]>();
  for (const id of campgroundIds) grouped.set(id, []);
  if (!campgroundIds.length) return grouped;
  const rows = await sqlClient<ReportRow[]>`
    SELECT r.id, r.campground_id, r.rating, r.observed_on, r.submitted_at,
      r.account_id, u.email_verified, r.moderation_status, r.deleted_at
    FROM reports r
    LEFT JOIN "user" u ON u.id = r.account_id
    WHERE r.campground_id = ANY(${campgroundIds}::uuid[])
      AND r.submitted_at <= ${generatedAt.toISOString()}::timestamptz
      AND r.moderation_status = 'published'
      AND r.deleted_at IS NULL
    ORDER BY r.campground_id, r.observed_on
  `;
  for (const row of rows) {
    const observedDate = parseDatabaseDate(row.observed_on);
    const submittedAt = parseDatabaseDate(row.submitted_at);
    // Reports store an observation date but not an observation time. Noon UTC
    // prevents date-only values from crossing a calendar boundary; v3 applies
    // the configured missing-time confidence reduction.
    observedDate.setUTCHours(12, 0, 0, 0);
    grouped.get(row.campground_id)?.push({
      id: row.id,
      rating: row.rating,
      observedAt: observedDate,
      submittedAt,
      accountVerified: Boolean(row.account_id && row.email_verified),
      anonymous: !row.account_id,
      moderationStatus: row.moderation_status,
      deletedAt: row.deleted_at ? parseDatabaseDate(row.deleted_at) : null,
      observationTimeKnown: false,
    });
  }
  return grouped;
}
