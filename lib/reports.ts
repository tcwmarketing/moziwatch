import { sqlClient } from "@/db";
import type postgres from "postgres";
import type { ReporterIdentity } from "./report-policy";
import { parseDatabaseDate, type DatabaseDate } from "./database-date";

export class DuplicateReportError extends Error {
  constructor(public retryAt: Date) {
    super(
      "A report was already submitted for this campground in the last 24 hours.",
    );
  }
}

export class ReportRateLimitError extends Error {
  constructor() {
    super("Too many reports were submitted recently. Please try again later.");
  }
}

type CreateReport = ReporterIdentity & {
  campgroundId: string;
  rating: number;
  comment: string | null;
  now?: Date;
};

export async function createReport(input: CreateReport) {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const lockKeys = [
    input.accountId ? `account:${input.accountId}` : null,
    input.anonymousTokenHash ? `anonymous:${input.anonymousTokenHash}` : null,
    `ip:${input.ipHash}`,
  ]
    .filter((value): value is string => Boolean(value))
    .sort();

  return sqlClient.begin(async (tx) => {
    for (const identity of lockKeys) {
      await tx`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.campgroundId}:${identity}`}, 0))`;
    }

    const recentByIp = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count FROM reports
      WHERE ip_hash = ${input.ipHash} AND submitted_at >= ${nowIso}::timestamptz - interval '1 hour'
    `;
    if ((recentByIp[0]?.count ?? 0) >= 10) throw new ReportRateLimitError();

    const duplicate = await tx<{ submitted_at: DatabaseDate }[]>`
      SELECT submitted_at FROM reports
      WHERE campground_id = ${input.campgroundId}::uuid
        AND submitted_at >= ${nowIso}::timestamptz - interval '24 hours'
        AND moderation_status <> 'deleted'
        AND (
          (${input.accountId}::text IS NOT NULL AND account_id = ${input.accountId}) OR
          (${input.anonymousTokenHash}::text IS NOT NULL AND anonymous_token_hash = ${input.anonymousTokenHash}) OR
          ip_hash = ${input.ipHash}
        )
      ORDER BY submitted_at DESC LIMIT 1
    `;
    if (duplicate[0]) {
      throw new DuplicateReportError(
        new Date(
          parseDatabaseDate(duplicate[0].submitted_at).getTime() +
            24 * 60 * 60 * 1000,
        ),
      );
    }

    const inserted = await tx<{ id: string }[]>`
      INSERT INTO reports (campground_id, rating, comment, account_id, anonymous_token_hash, ip_hash, submitted_at)
      VALUES (${input.campgroundId}::uuid, ${input.rating}, ${input.comment}, ${input.accountId},
              ${input.anonymousTokenHash}, ${input.ipHash}, ${nowIso}::timestamptz)
      RETURNING id
    `;

    await recalculateCampgroundAggregates(tx, input.campgroundId, now);
    return { id: inserted[0].id, submittedAt: now };
  });
}

export async function recalculateCampgroundAggregates(
  tx: postgres.TransactionSql,
  campgroundId: string,
  now = new Date(),
) {
  const nowIso = now.toISOString();
  await tx`
    INSERT INTO campground_aggregates (
      campground_id, recent_average, recent_count, historical_average,
      historical_count, most_recent_report_at, calculated_at
    )
    SELECT
      ${campgroundId}::uuid,
      avg(rating) FILTER (WHERE submitted_at >= ${nowIso}::timestamptz - interval '30 days')::real,
      count(*) FILTER (WHERE submitted_at >= ${nowIso}::timestamptz - interval '30 days')::int,
      avg(rating)::real,
      count(*)::int,
      max(submitted_at),
      ${nowIso}::timestamptz
    FROM reports
    WHERE campground_id = ${campgroundId}::uuid
      AND moderation_status = 'published'
      AND deleted_at IS NULL
    ON CONFLICT (campground_id) DO UPDATE SET
      recent_average = excluded.recent_average,
      recent_count = excluded.recent_count,
      historical_average = excluded.historical_average,
      historical_count = excluded.historical_count,
      most_recent_report_at = excluded.most_recent_report_at,
      calculated_at = excluded.calculated_at
  `;
}
