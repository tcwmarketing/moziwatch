import { describe, expect, it } from "vitest";
import { aggregateReports, type AggregationReport } from "@/lib/aggregation";

const now = new Date("2026-07-14T12:00:00.000Z");
const report = (
  rating: number,
  daysAgo: number,
  status: AggregationReport["moderationStatus"] = "published",
): AggregationReport => ({
  rating,
  submittedAt: new Date(now.getTime() - daysAgo * 86400000),
  moderationStatus: status,
});

describe("rating aggregation", () => {
  it("returns explicit empty aggregates", () =>
    expect(aggregateReports([], now)).toMatchObject({
      recentAverage: null,
      recentCount: 0,
      historicalAverage: null,
      historicalCount: 0,
    }));
  it("handles one report", () =>
    expect(aggregateReports([report(3, 1)], now)).toMatchObject({
      recentAverage: 3,
      recentCount: 1,
      historicalAverage: 3,
      historicalCount: 1,
    }));
  it("includes a report exactly on the 30-day boundary", () =>
    expect(aggregateReports([report(4, 30)], now).recentCount).toBe(1));
  it("excludes reports before the rolling boundary only from recent", () =>
    expect(aggregateReports([report(5, 30.0001)], now)).toMatchObject({
      recentCount: 0,
      historicalCount: 1,
    }));
  it("excludes pending, hidden, rejected, deleted, and soft-deleted reports", () => {
    const rows: AggregationReport[] = [
      report(2, 2),
      report(5, 1, "pending"),
      report(5, 1, "hidden"),
      report(5, 1, "rejected"),
      report(5, 1, "deleted"),
      { ...report(5, 1), deletedAt: now },
    ];
    expect(aggregateReports(rows, now)).toMatchObject({
      recentAverage: 2,
      recentCount: 1,
      historicalCount: 1,
    });
  });
});
