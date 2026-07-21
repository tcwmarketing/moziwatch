import { describe, expect, it } from "vitest";
import {
  representativeCoverageGaps,
  type CoverageGap,
} from "@/worker/locations/coverage-audit";

function gap(overrides: Partial<CoverageGap>): CoverageGap {
  return {
    geonameId: "place-1",
    name: "Example",
    latitude: 49,
    longitude: -120,
    country: "CA",
    region: "BC",
    population: 10_000,
    kind: "populated_place",
    expectedRadiusKm: 75,
    nearestPublicId: null,
    nearestPublicName: null,
    nearestPublicDistanceKm: null,
    stagedCandidateCount: 0,
    classification: "source_gap",
    sampleCandidates: [],
    ...overrides,
  };
}

describe("coverage gap representatives", () => {
  it("collapses nearby suburbs to the larger populated place", () => {
    const result = representativeCoverageGaps([
      gap({ geonameId: "large", name: "Large", population: 100_000 }),
      gap({
        geonameId: "small",
        name: "Small",
        population: 20_000,
        latitude: 49.1,
        longitude: -120,
      }),
    ]);

    expect(result.map((item) => item.geonameId)).toEqual(["large"]);
  });

  it("retains nearby places when they are in different countries", () => {
    const result = representativeCoverageGaps([
      gap({ geonameId: "ca", country: "CA" }),
      gap({ geonameId: "us", country: "US", latitude: 49.05 }),
    ]);

    expect(result).toHaveLength(2);
  });

  it("keeps rural staged clusters that are not represented by a city gap", () => {
    const result = representativeCoverageGaps([
      gap({ geonameId: "city", population: 50_000 }),
      gap({
        geonameId: "cluster",
        kind: "staged_cluster",
        population: 0,
        latitude: 50,
        stagedCandidateCount: 6,
        classification: "publication_gap",
      }),
    ]);

    expect(result.map((item) => item.geonameId)).toEqual(["city", "cluster"]);
  });
});
