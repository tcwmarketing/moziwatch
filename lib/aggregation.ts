export type AggregationReport = {
  rating: number;
  observedAt: Date;
  moderationStatus: "pending" | "published" | "hidden" | "rejected" | "deleted";
  deletedAt?: Date | null;
};

function mean(values: number[]) {
  return values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
}

export function aggregateReports(
  reports: AggregationReport[],
  now = new Date(),
) {
  const valid = reports.filter(
    (report) => report.moderationStatus === "published" && !report.deletedAt,
  );
  const boundary = now.getTime() - 30 * 24 * 60 * 60 * 1000;
  const recent = valid.filter(
    (report) => report.observedAt.getTime() >= boundary,
  );
  return {
    recentAverage: mean(recent.map((report) => report.rating)),
    recentCount: recent.length,
    historicalAverage: mean(valid.map((report) => report.rating)),
    historicalCount: valid.length,
    mostRecentReportAt: valid.length
      ? new Date(
          Math.max(...valid.map((report) => report.observedAt.getTime())),
        )
      : null,
  };
}
