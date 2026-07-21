import { sqlClient } from "@/db";
import { refreshRecentReportSummaries } from "./report-summaries";

try {
  const result = await refreshRecentReportSummaries();
  console.log(
    `Updated report summaries for ${result.campgroundCount} campgrounds from ${result.reportCount} recent published reports.`,
  );
} finally {
  await sqlClient.end();
}
