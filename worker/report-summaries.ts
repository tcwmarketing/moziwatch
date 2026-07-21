import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";
import { summarizeRecentReportElements } from "@/lib/report-summary";

type Row = {
  campground_id: string;
  comment: string | null;
  observed_on: DatabaseDate;
};

export async function refreshRecentReportSummaries(now = new Date()) {
  const rows = await sqlClient<Row[]>`
    SELECT campground_id, comment, observed_on
    FROM reports
    WHERE moderation_status = 'published'
      AND deleted_at IS NULL
      AND observed_on >= (${now.toISOString()}::timestamptz - interval '30 days')::date
    ORDER BY campground_id, observed_on DESC
  `;
  const grouped = new Map<string, Row[]>();
  for (const row of rows) {
    const group = grouped.get(row.campground_id) || [];
    group.push(row);
    grouped.set(row.campground_id, group);
  }

  await sqlClient.begin(async (tx) => {
    await tx`
      UPDATE campground_aggregates
      SET report_summary_phrases = ARRAY[]::text[],
          report_summary_report_count = 0,
          report_summary_generated_at = ${now.toISOString()}::timestamptz
      WHERE recent_count = 0 OR most_recent_report_at < ${now.toISOString()}::timestamptz - interval '30 days'
    `;
    for (const [campgroundId, reports] of grouped) {
      const phrases = summarizeRecentReportElements(
        reports.map((report) => ({
          comment: report.comment,
          observedAt: parseDatabaseDate(report.observed_on),
        })),
        now,
      );
      await tx`
        INSERT INTO campground_aggregates (
          campground_id, report_summary_phrases,
          report_summary_report_count, report_summary_generated_at
        ) VALUES (
          ${campgroundId}::uuid, ${phrases}::text[], ${reports.length},
          ${now.toISOString()}::timestamptz
        )
        ON CONFLICT (campground_id) DO UPDATE SET
          report_summary_phrases = excluded.report_summary_phrases,
          report_summary_report_count = excluded.report_summary_report_count,
          report_summary_generated_at = excluded.report_summary_generated_at
      `;
    }
  });
  return { campgroundCount: grouped.size, reportCount: rows.length };
}
