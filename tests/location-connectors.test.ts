import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeBcRecreationSite } from "@/worker/locations/connectors/bc";
import { normalizeBcParksCampground } from "@/worker/locations/connectors/bc-parks";
import {
  normalizeNpsCampground,
  npsRecords,
} from "@/worker/locations/connectors/nps";
import { normalizeOsmFeature } from "@/worker/locations/connectors/osm";
import {
  normalizeRidbFacility,
  ridbRecords,
} from "@/worker/locations/connectors/ridb";
import { classifyCampground } from "@/worker/locations/classification";
import { normalizeOverturePlace } from "@/worker/locations/connectors/overture";
import { normalizeParksCanadaGroup } from "@/worker/locations/connectors/parks-canada";
import { normalizeQuebecCampground } from "@/worker/locations/connectors/quebec";
import { normalizeNovaScotiaPark } from "@/worker/locations/connectors/nova-scotia";
import { normalizeUsfsCampground } from "@/worker/locations/connectors/usfs";
import {
  campgroundNameIdentitySimilarity,
  MATCH_THRESHOLDS,
  scoreLocationMatch,
  type MatchCandidate,
} from "@/worker/locations/matching";

const point = { type: "Point" as const, coordinates: [-123.1, 49.2] };

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.RIDB_API_KEY;
  delete process.env.NPS_API_KEY;
});

describe("location source normalization", () => {
  it("never imports an individual OSM camp pitch", () => {
    expect(
      normalizeOsmFeature({
        type: "Feature",
        id: 1,
        geometry: point,
        properties: {
          tourism: "camp_pitch",
          name: "Pitch 14",
          "addr:country": "CA",
        },
      }),
    ).toBeNull();
  });

  it("normalizes permitted official and OSM campground records", () => {
    const osm = normalizeOsmFeature({
      type: "Feature",
      id: 101,
      geometry: point,
      properties: {
        tourism: "camp_site",
        name: "Pine Creek Campground",
        "addr:country": "US",
        "addr:state": "WA",
        operator: "National Park Service",
        capacity: "42",
        "@type": "node",
        "@id": "101",
      },
    });
    const nps = normalizeNpsCampground({
      id: "nps-101",
      name: "Pine Creek Campground",
      latitude: "49.2",
      longitude: "-123.1",
      parkCode: "pine",
      addresses: [{ type: "Physical", stateCode: "WA", city: "Pine" }],
    });
    const ridb = normalizeRidbFacility({
      FacilityID: 101,
      FacilityName: "Pine Creek Campground",
      FacilityLatitude: 49.2,
      FacilityLongitude: -123.1,
      FacilityTypeDescription: "Campground",
      FacilityState: "WA",
    });
    const bc = normalizeBcRecreationSite({
      type: "Feature",
      geometry: point,
      properties: {
        FOREST_FILE_ID: "REC101",
        PROJECT_NAME: "Pine Creek Recreation Site",
        NUM_CAMP_SITES: 12,
      },
    });
    expect([osm?.source, nps?.source, ridb?.source, bc?.source]).toEqual([
      "openstreetmap",
      "nps",
      "ridb",
      "bc-recreation",
    ]);
    expect(bc?.locationType).toBe("other_established_campground");
    expect(osm).toMatchObject({
      campsiteCount: 42,
      campsiteCountKind: "mapped_capacity",
    });
    expect(bc).toMatchObject({
      campsiteCount: 12,
      campsiteCountKind: "official_total",
    });
  });

  it("uses mapped OSM pitch capacity without double-counting flexible site types", () => {
    const pitches = normalizeOsmFeature({
      type: "Feature",
      id: 102,
      geometry: point,
      properties: {
        tourism: "camp_site",
        name: "Mapped Pitch Campground",
        "addr:country": "US",
        "capacity:pitches": "78",
      },
    });
    const typed = normalizeOsmFeature({
      type: "Feature",
      id: 103,
      geometry: point,
      properties: {
        tourism: "camp_site",
        name: "Flexible Site Campground",
        "addr:country": "CA",
        "capacity:tents": "30",
        "capacity:caravans": "24",
      },
    });
    expect(pitches?.campsiteCount).toBe(78);
    expect(typed?.campsiteCount).toBe(30);
  });

  it("retains the official NPS total campsite count", () => {
    expect(
      normalizeNpsCampground({
        id: "nps-capacity",
        name: "Official NPS Campground",
        latitude: "40",
        longitude: "-110",
        campsites: { totalSites: "126" },
      }),
    ).toMatchObject({
      campsiteCount: 126,
      campsiteCountKind: "official_total",
    });
  });

  it("only treats a BC recreation record as a campground when it has campsites", () => {
    const lakeWithoutCamping = normalizeBcRecreationSite({
      type: "Feature",
      geometry: point,
      properties: {
        FOREST_FILE_ID: "REC-LAKE",
        PROJECT_NAME: "Example Lake",
        NUM_CAMP_SITES: 0,
      },
    });
    const lakefrontCampground = normalizeBcRecreationSite({
      type: "Feature",
      geometry: point,
      properties: {
        FOREST_FILE_ID: "REC-CAMP",
        PROJECT_NAME: "Example Lake",
        NUM_CAMP_SITES: 8,
        STRUCTURE_DESC1: "Toilet - Wood",
        STRUCTURE_DESC2: "Fire Ring",
      },
    });

    expect(lakeWithoutCamping).toBeNull();
    expect(lakefrontCampground).toMatchObject({
      name: "Example Lake",
      locationType: "other_established_campground",
    });
  });

  it("normalizes an official BC Parks frontcountry campground", () => {
    const campground = normalizeBcParksCampground(
      {
        id: 100,
        orcs: 307,
        protectedAreaName: "Bear Creek Park",
        legalStatus: "Active",
        url: "https://bcparks.ca/bear-creek-park/",
        latitude: 49.928836,
        longitude: -119.516802,
        description: "<p>Lakeside camping near Kelowna.</p>",
        locationNotes:
          "<p>The closest communities, towns, and cities are Kelowna and Westbank.</p>",
      },
      [
        {
          id: 1,
          isActive: true,
          campingType: {
            campingTypeCode: "frontcountry-camping",
            campingTypeName: "Frontcountry camping",
          },
        },
        {
          id: 2,
          isActive: true,
          campingType: {
            campingTypeCode: "rv",
            campingTypeName: "RV-accessible camping",
          },
        },
      ],
      [
        {
          id: 912,
          parkSubArea: "Bear Creek Campground",
          isActive: true,
          hasReservations: true,
          frontcountrySites: "143",
          vehicleSites: "143",
          parkSubAreaType: {
            subAreaTypeCode: "frontcountry-camping",
          },
        },
      ],
    );

    expect(campground).toMatchObject({
      source: "bc-parks",
      externalId: "307",
      name: "Bear Creek Park",
      locationType: "developed_campground",
      locality: "Kelowna",
      operator: "BC Parks",
      campsiteCount: 143,
      campsiteCountKind: "official_total",
      raw: {
        officialCampsiteCount: 143,
        facilityLabels: [
          "Frontcountry camping",
          "RV-accessible camping",
          "Reservable campsites",
        ],
      },
    });
    expect(campground?.description).toBe("Lakeside camping near Kelowna.");
  });

  it("does not import a BC park without an active campground sub-area", () => {
    expect(
      normalizeBcParksCampground(
        {
          id: 101,
          orcs: 5019,
          protectedAreaName: "Example Protected Area",
          legalStatus: "Active",
          latitude: 50,
          longitude: -120,
        },
        [],
        [],
      ),
    ).toBeNull();
  });

  it("matches equivalent OSM and NPS campgrounds but not nearby distinct names", () => {
    const incoming = normalizeNpsCampground({
      id: "nps-match",
      name: "Pine Creek Campground",
      latitude: "49.2",
      longitude: "-123.1",
      addresses: [{ stateCode: "WA", city: "Pine", line1: "1 Park Road" }],
    })!;
    const matching: MatchCandidate = {
      id: "osm-match",
      name: "Pine Creek Campground",
      normalizedName: "pine creek",
      country: "US",
      region: "WA",
      address: "1 Park Road",
      website: null,
      phone: null,
      operator: null,
      parentName: null,
      distanceMeters: 30,
      nameSimilarity: 1,
    };
    const distinct = {
      ...matching,
      id: "adjacent-campground",
      name: "Cedar Loop",
      normalizedName: "cedar loop",
      address: "2 Park Road",
      distanceMeters: 40,
      nameSimilarity: 0.12,
    };
    expect(scoreLocationMatch(incoming, matching).score).toBeGreaterThanOrEqual(
      MATCH_THRESHOLDS.automatic,
    );
    expect(scoreLocationMatch(incoming, distinct).score).toBeLessThan(
      MATCH_THRESHOLDS.review,
    );
  });

  it.each([
    ["Sanders Family Camp", "Camp Sanders"],
    ["Cabins by the Joe", "RV and Cabins by the Joe"],
    ["Lyons Ferry Marina", "Starbuck / Lyons Ferry Marina KOA Holiday"],
  ])("recognizes provider naming variants for %s", (left, right) => {
    expect(
      campgroundNameIdentitySimilarity(left, right),
    ).toBeGreaterThanOrEqual(0.95);
  });

  it("does not equate nearby campgrounds that only share a generic place term", () => {
    expect(
      campgroundNameIdentitySimilarity(
        "North Basin Campground",
        "South Basin RV Park",
      ),
    ).toBeLessThan(0.85);
  });

  it("sends a farther campground naming variant to review instead of creating another canonical record", () => {
    const incoming = normalizeNpsCampground({
      id: "cabins-by-the-joe-source",
      name: "Cabins by the Joe and RV Park",
      latitude: "47.249",
      longitude: "-115.818",
      addresses: [{ stateCode: "ID", city: "Avery" }],
    })!;
    const result = scoreLocationMatch(incoming, {
      id: "cabins-by-the-joe-existing",
      name: "Cabins by the Joe",
      normalizedName: "cabins by the joe",
      country: "US",
      region: "ID",
      address: "Address not provided",
      website: null,
      phone: null,
      operator: null,
      parentName: null,
      distanceMeters: 823,
      nameSimilarity: 0.5,
    });
    expect(result.score).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.review);
    expect(result.score).toBeLessThan(MATCH_THRESHOLDS.automatic);
  });

  it("does not match different park pages only because they share a provider domain", () => {
    const incoming = normalizeNpsCampground({
      id: "shared-domain-source",
      name: "Fintry Park",
      latitude: "50.13",
      longitude: "-119.54",
      url: "https://bcparks.ca/fintry-park/",
      addresses: [{ stateCode: "BC" }],
    })!;
    const candidate: MatchCandidate = {
      id: "different-park",
      name: "Bear Creek Park",
      normalizedName: "bear creek park",
      country: "US",
      region: "BC",
      address: "Address not provided",
      website: "https://bcparks.ca/bear-creek-park/",
      phone: null,
      operator: null,
      parentName: null,
      distanceMeters: 1_000,
      nameSimilarity: 0.5,
    };
    incoming.country = "US";

    const differentPage = scoreLocationMatch(incoming, candidate);
    const samePage = scoreLocationMatch(incoming, {
      ...candidate,
      website: "https://bcparks.ca/fintry-park/",
    });

    expect(differentPage.websiteMatch).toBe(false);
    expect(differentPage.score).toBeLessThan(MATCH_THRESHOLDS.review);
    expect(samePage.websiteMatch).toBe(true);
    expect(samePage.score).toBeGreaterThanOrEqual(MATCH_THRESHOLDS.automatic);
  });

  it("treats different KOA campground pages as different websites", () => {
    const incoming = normalizeNpsCampground({
      id: "starbuck-koa",
      name: "Starbuck / Lyons Ferry Marina KOA Holiday",
      latitude: "46.585",
      longitude: "-118.22",
      url: "https://koa.com/campgrounds/starbuck/",
      addresses: [{ stateCode: "WA", city: "Starbuck" }],
    })!;
    const result = scoreLocationMatch(incoming, {
      id: "other-koa",
      name: "Other KOA Holiday",
      normalizedName: "other koa holiday",
      country: "US",
      region: "WA",
      address: "Address not provided",
      website: "https://koa.com/campgrounds/other-location/",
      phone: null,
      operator: null,
      parentName: null,
      distanceMeters: 100,
      nameSimilarity: 0.15,
    });
    expect(result.websiteMatch).toBe(false);
    expect(result.score).toBeLessThan(MATCH_THRESHOLDS.review);
  });

  it("paginates the RIDB connector using stable facility IDs", async () => {
    process.env.RIDB_API_KEY = "fixture-key";
    const facility = (id: number) => ({
      FacilityID: id,
      FacilityName: `Fixture Campground ${id}`,
      FacilityLatitude: 40 + id / 1_000,
      FacilityLongitude: -110,
      FacilityTypeDescription: "Campground",
      FacilityState: "UT",
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            RECDATA: [{ ActivityID: 9, ActivityName: "Camping" }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            RECDATA: Array.from({ length: 50 }, (_, index) =>
              facility(index + 1),
            ),
            METADATA: { RESULTS: { TOTAL_COUNT: 51 } },
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            RECDATA: [facility(51)],
            METADATA: { RESULTS: { TOTAL_COUNT: 51 } },
          }),
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const records = [];
    for await (const record of ridbRecords()) records.push(record);
    expect(records).toHaveLength(51);
    expect(new URL(fetchMock.mock.calls[2][0]).searchParams.get("offset")).toBe(
      "50",
    );
    expect(new Set(records.map((record) => record.externalId)).size).toBe(51);
  });

  it("uses exact Overture campground categories and excludes permanent closures", () => {
    const base = {
      id: "ov-1",
      name: "Mixed RV and Tent Campground",
      primary_category: "campground",
      alternate_categories: "[]",
      longitude: -75,
      latitude: 45,
      region: "ON",
      locality: "Ottawa",
      operating_status: "open",
    };
    expect(normalizeOverturePlace(base, "CA", "2026-06-17.0")).toMatchObject({
      source: "overture-ca",
    });
    expect(
      normalizeOverturePlace(
        { ...base, id: "ov-2", primary_category: "rv_park" },
        "CA",
        "2026-06-17.0",
      ),
    ).toMatchObject({ rejected: true });
    expect(
      normalizeOverturePlace(
        { ...base, id: "ov-3", operating_status: "permanently_closed" },
        "CA",
        "2026-06-17.0",
      ),
    ).toMatchObject({ rejected: true, reason: "permanently_closed" });
  });

  it("does not reject a valid campground merely because RV appears in its name", () => {
    expect(
      classifyCampground({
        name: "Pine RV and Tent Campground",
        category: "campground",
        hasTentOrMixedSites: true,
      }),
    ).toMatchObject({ accepted: true });
    expect(
      classifyCampground({
        name: "Pine Motorcoach Resort",
        category: "campground",
        facilityType: "RV park",
      }),
    ).toMatchObject({ accepted: false, reason: "rv_only_facility" });
  });

  it("consolidates Parks Canada pitches and categorically excludes BC", () => {
    const alberta = normalizeParksCanadaGroup([
      {
        properties: {
          Name_e: "Tunnel Mountain Village I",
          URL_f: "BAN-TMV1-C24",
          Accommodation_Type: "Camping",
        },
        geometry: { type: "Point", coordinates: [-115.52, 51.19] },
      },
      {
        properties: {
          Name_e: "Tunnel Mountain Village I",
          URL_f: "BAN-TMV1-C25",
          Accommodation_Type: "Camping",
        },
        geometry: { type: "Point", coordinates: [-115.521, 51.191] },
      },
    ]);
    const bc = normalizeParksCanadaGroup([
      {
        properties: {
          Name_e: "Prior Centennial",
          URL_f: "GINPR-PC-1",
          Accommodation_Type: "Camping",
        },
        geometry: { type: "Point", coordinates: [-123.27, 48.76] },
      },
    ]);
    expect(alberta).toMatchObject({
      source: "parks-canada",
      region: "AB",
      raw: { code: "BAN" },
    });
    expect(bc).toMatchObject({
      rejected: true,
      reason: "british_columbia_excluded",
    });
  });

  it("normalizes the Quebec, Nova Scotia and USFS authoritative fixtures", () => {
    const qc = normalizeQuebecCampground({
      SyndicObjectID: "QC-1",
      SyndicObjectName: "Camping du Lac",
      ObjectTypeName: "Camping",
      Geolocalisations: [{ Longitude: "-72", Latitude: "46" }],
      Emplacementss: [{ Sitesacamper: 20, Pretsacamper: 3 }],
      Adresses: [{ Municipalite: "Québec", Numerovoie: "1 rue Test" }],
    });
    const ns = normalizeNovaScotiaPark({
      name_full: "Amherst Shore Provincial Park",
      park_type: "Camping",
      the_geom: { type: "Point", coordinates: [-63.87, 45.96] },
    });
    const usfs = normalizeUsfsCampground({
      geometry: { type: "Point", coordinates: [-111, 44] },
      properties: {
        recareaid: 10,
        recareaname: "Pine Campground",
        markeractivity: "Campground",
        openstatus: "open",
      },
    });
    expect(["rejected" in qc, "rejected" in ns, "rejected" in usfs]).toEqual([
      false,
      false,
      false,
    ]);
    expect(qc).toMatchObject({
      campsiteCount: 23,
      campsiteCountKind: "official_total",
    });

    const ridb = normalizeRidbFacility({
      FacilityID: "long-fields",
      FacilityName: `Campground ${"N".repeat(200)}`,
      FacilityLatitude: 40,
      FacilityLongitude: -110,
      FacilityDescription: "Camping",
      FacilityPhone: "1".repeat(80),
      __campingActivity: true,
    });
    expect(ridb?.name).toHaveLength(160);
    expect(ridb?.phone).toHaveLength(60);
  });

  it("repairs unsigned USFS western longitudes and rejects missing coordinates", () => {
    const unsigned = normalizeUsfsCampground({
      geometry: { type: "Point", coordinates: [113.083134, 45.479509] },
      properties: {
        recareaid: 11,
        recareaname: "Price Creek Campground",
        markeractivity: "Campground",
      },
    });
    expect(unsigned).not.toHaveProperty("rejected", true);
    if (!("rejected" in unsigned))
      expect(unsigned.geometry).toEqual({
        type: "Point",
        coordinates: [-113.083134, 45.479509],
      });

    expect(
      normalizeUsfsCampground({
        geometry: { type: "Point", coordinates: [0, 0] },
        properties: {
          recareaid: 12,
          recareaname: "Coordinate Placeholder Campground",
          markeractivity: "Campground",
        },
      }),
    ).toMatchObject({
      rejected: true,
      reason: "invalid_coordinates",
    });
  });

  it("rejects non-campground USFS features even when the source tags camping", () => {
    for (const name of [
      "233 Trailhead: (936) 344-6205",
      "China Wall Staging Area",
      "Ballinger Canyon OHV Day Use Riding Area",
      "Kenton Ranger District",
    ]) {
      expect(
        normalizeUsfsCampground({
          geometry: { type: "Point", coordinates: [-95, 31] },
          properties: {
            recareaid: name,
            recareaname: name,
            markeractivity: "Camping",
          },
        }),
      ).toMatchObject({
        rejected: true,
        reason: "non_campground_recreation_feature",
      });
    }
  });

  it("paginates the NPS campground connector using stable campground IDs", async () => {
    process.env.NPS_API_KEY = "fixture-key";
    const campground = (id: number) => ({
      id: `nps-${id}`,
      name: `Fixture NPS Campground ${id}`,
      latitude: 40 + id / 10_000,
      longitude: -110,
      parkCode: "test",
      addresses: [{ stateCode: "UT", city: "Fixture" }],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            total: "501",
            data: Array.from({ length: 500 }, (_, index) =>
              campground(index + 1),
            ),
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ total: "501", data: [campground(501)] })),
      );
    vi.stubGlobal("fetch", fetchMock);
    const records = [];
    for await (const record of npsRecords()) records.push(record);
    expect(records).toHaveLength(501);
    expect(new URL(fetchMock.mock.calls[1][0]).searchParams.get("start")).toBe(
      "500",
    );
    expect(new Set(records.map((record) => record.externalId)).size).toBe(501);
  });
});
