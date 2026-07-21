import { afterEach, describe, expect, it, vi } from "vitest";
import {
  overpassEndpoints,
  overpassGapQuery,
  queryOverpassBatch,
} from "@/worker/locations/connectors/osm-overpass";
import { osmPublicationDecision } from "@/worker/locations/osm-verification";
import type { CoverageGap } from "@/worker/locations/coverage-audit";

const gap: CoverageGap = {
  geonameId: "test",
  name: "Test City",
  latitude: 33.5,
  longitude: -101.8,
  country: "US",
  region: "TX",
  population: 100_000,
  kind: "populated_place",
  expectedRadiusKm: 45,
  nearestPublicId: null,
  nearestPublicName: null,
  nearestPublicDistanceKm: null,
  stagedCandidateCount: 0,
  classification: "source_gap",
  sampleCandidates: [],
};

describe("OSM coverage gap fill", () => {
  afterEach(() => {
    delete process.env.OVERPASS_API_URL;
    delete process.env.OVERPASS_API_URLS;
    vi.restoreAllMocks();
  });

  it("queries only named campground feature types around a gap", () => {
    const query = overpassGapQuery([gap]);
    expect(query).toContain("around:45000,33.5,-101.8");
    expect(query).toContain('["tourism"="camp_site"]["name"]');
    expect(query).toContain('["tourism"="caravan_site"]["name"]');
  });

  it("rotates to a fallback endpoint when the first endpoint fails", async () => {
    process.env.OVERPASS_API_URLS =
      "https://first.test/interpreter,https://fallback.test/interpreter";
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ elements: [{ type: "node", id: 1 }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );

    const result = await queryOverpassBatch([gap]);

    expect(overpassEndpoints()).toEqual([
      "https://first.test/interpreter",
      "https://fallback.test/interpreter",
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1]?.[0]).toBe(
      "https://fallback.test/interpreter",
    );
    expect(result).toHaveLength(1);
  });

  it("publishes a supported campground", () => {
    expect(
      osmPublicationDecision({
        name: "Prairie View Campground",
        locationType: "developed_campground",
        operator: "City of Example",
        website: null,
        phone: null,
        address: null,
        campsiteCount: null,
        independentSourceCount: 1,
      }).publish,
    ).toBe(true);
  });

  it("holds weak and excluded records back", () => {
    const base = {
      locationType: "developed_campground",
      operator: null,
      website: null,
      phone: null,
      address: null,
      campsiteCount: null,
      independentSourceCount: 1,
    };
    expect(
      osmPublicationDecision({ ...base, name: "Camp Example" }).publish,
    ).toBe(false);
    expect(
      osmPublicationDecision({
        ...base,
        name: "Scout Campground",
        operator: "Scout Council",
        website: "https://example.test",
        campsiteCount: 40,
        independentSourceCount: 2,
      }).publish,
    ).toBe(false);
  });
});
