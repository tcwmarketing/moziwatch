import { describe, expect, it } from "vitest";
import {
  buildCampgroundFaq,
  isCampgroundContentIndexable,
} from "@/lib/campground-content";
import type { CampgroundHabitatSummary } from "@/lib/campground-habitat";

const habitat = (
  overrides: Partial<CampgroundHabitatSummary> = {},
): CampgroundHabitatSummary => ({
  wetlandCoverage: {
    within250m: 0,
    from250mTo1km: 0.02,
    from1kmTo3km: 0.04,
  },
  marshCoverage: {
    within250m: 0,
    from250mTo1km: 0,
    from1kmTo3km: 0,
  },
  seasonalWaterCoverage: {
    within250m: 0.01,
    from250mTo1km: 0.02,
    from1kmTo3km: 0.03,
  },
  forestCoverage: {
    within250m: 0.72,
    from250mTo1km: 0.64,
    from1kmTo3km: 0.55,
  },
  smallWaterBodyDensity: 0.62,
  stagnantWaterPotential: 0.18,
  lakeShorelineProximity: 0.1,
  shorelineWaterEdgeLengthKm: 1.2,
  largeOpenWaterCoverage: 0.04,
  fastRiverProximity: 0,
  slowRiverProximity: 0.1,
  vegetationCoverage: 0.86,
  elevationM: 540,
  slopeDegrees: 3.2,
  drainagePotential: 0.28,
  floodplainExposure: 0.12,
  annualRainfallMm: 940,
  warmSeasonRainfallMm: 410,
  landCoverType: "tree cover / grassland",
  profileConfidence: 0.78,
  ...overrides,
});

const input = {
  name: "Cedar Marsh Campground",
  slug: "cedar-marsh-campground",
  city: "Sample Lake",
  region: "BC",
  recentAverage: 3.8,
  recentCount: 5,
  historicalAverage: 3.2,
  historicalCount: 18,
  forecast: {
    targetDate: "2026-07-27T00:00:00.000Z",
    score: 0.68,
    level: "Heavy",
    confidence: 0.74,
  },
  forecastNights: [
    {
      targetDate: "2026-07-27T00:00:00.000Z",
      score: 0.68,
      level: "Heavy",
      confidence: 0.74,
    },
    {
      targetDate: "2026-07-28T00:00:00.000Z",
      score: 0.72,
      level: "Heavy",
      confidence: 0.7,
    },
  ],
  habitat: habitat(),
};

describe("campground-specific FAQ content", () => {
  it("creates substantial visible answers for the campground", () => {
    const items = buildCampgroundFaq(input);
    expect(items).toHaveLength(6);
    expect(items[0].question).toBe(
      "How bad are the mosquitoes at Cedar Marsh Campground?",
    );
    expect(items[1].question).toBe(
      "Why are there mosquitoes at Cedar Marsh Campground?",
    );
    for (const item of items) {
      expect(
        item.answer.split(/[.!?](?:\s|$)/).filter(Boolean).length,
      ).toBeGreaterThan(1);
      expect(item.answer.split(/\s+/).length).toBeGreaterThan(45);
    }
  });

  it("keeps camper observations separate from the modeled forecast", () => {
    const answer = buildCampgroundFaq(input)[0].answer;
    expect(answer).toContain("5 published reports");
    expect(answer).toContain("Today's approximate forecast");
    expect(answer).toContain("observed rating and forecast remain separate");
  });

  it("produces meaningfully different explanations for contrasting habitats", () => {
    const wetlandAnswer = buildCampgroundFaq(input)[1].answer;
    const highDryAnswer = buildCampgroundFaq({
      ...input,
      name: "High Ridge Campground",
      slug: "high-ridge-campground",
      habitat: habitat({
        wetlandCoverage: {},
        seasonalWaterCoverage: {},
        forestCoverage: { within250m: 0.08 },
        smallWaterBodyDensity: 0,
        stagnantWaterPotential: 0,
        vegetationCoverage: 0.18,
        elevationM: 2_150,
        slopeDegrees: 17.4,
        drainagePotential: 0.88,
        annualRainfallMm: 280,
        landCoverType: "bare ground / sparse vegetation",
      }),
    })[1].answer;

    expect(wetlandAnswer).toContain("wetland");
    expect(wetlandAnswer).toContain("forested");
    expect(highDryAnswer).toContain("2,150 metres");
    expect(highDryAnswer).toContain("quick drainage");
    expect(wetlandAnswer).not.toBe(highDryAnswer);
  });

  it("does not invent habitat or low risk when information is unavailable", () => {
    const items = buildCampgroundFaq({
      ...input,
      recentAverage: null,
      recentCount: 0,
      historicalAverage: null,
      historicalCount: 0,
      forecast: null,
      forecastNights: [],
      habitat: null,
    });

    expect(items[0].answer).toContain("not yet a current observed rating");
    expect(items[0].answer).toContain("has not been published");
    expect(items[1].answer).toContain("avoids inventing");
    expect(items[5].answer).toContain("Habitat coverage is still incomplete");
  });

  it("varies answer lengths instead of repeating one templated paragraph size", () => {
    const wordCounts = buildCampgroundFaq(input).map(
      (item) => item.answer.split(/\s+/).length,
    );
    expect(new Set(wordCounts).size).toBeGreaterThan(3);
  });

  it("reserves indexing for campground pages with useful evidence", () => {
    expect(
      isCampgroundContentIndexable({
        hasHabitat: true,
        recentCount: 0,
        historicalCount: 0,
        forecastAvailable: false,
      }),
    ).toBe(true);
    expect(
      isCampgroundContentIndexable({
        hasHabitat: false,
        recentCount: 1,
        historicalCount: 1,
        forecastAvailable: false,
      }),
    ).toBe(true);
    expect(
      isCampgroundContentIndexable({
        hasHabitat: false,
        recentCount: 0,
        historicalCount: 0,
        forecastAvailable: false,
      }),
    ).toBe(false);
  });
});
