import { describe, expect, it } from "vitest";
import { summarizeRecentReportElements } from "@/lib/report-summary";

const now = new Date("2026-07-17T12:00:00Z");

describe("recent report summaries", () => {
  it("requires a common theme and returns at most three short phrases", () => {
    const result = summarizeRecentReportElements(
      [
        { comment: "Bad near the lake at dusk after rain", observedAt: now },
        {
          comment: "Worse at dusk beside the water after rain",
          observedAt: now,
        },
        { comment: "Lots in the shaded campsite", observedAt: now },
      ],
      now,
    );
    expect(result).toEqual(["Worse at dusk", "Near water", "After rain"]);
    expect(result.every((phrase) => phrase.split(" ").length <= 3)).toBe(true);
  });

  it("does not turn one report into a campground-wide claim", () => {
    expect(
      summarizeRecentReportElements(
        [{ comment: "Heavy swarms at dusk", observedAt: now }],
        now,
      ),
    ).toEqual([]);
  });

  it("excludes reports older than 30 days", () => {
    expect(
      summarizeRecentReportElements(
        [
          { comment: "Near the lake", observedAt: now },
          { comment: "Near the lake", observedAt: new Date("2026-05-01") },
        ],
        now,
      ),
    ).toEqual([]);
  });
});
