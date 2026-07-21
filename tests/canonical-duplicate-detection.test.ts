import { describe, expect, it } from "vitest";
import {
  detectCanonicalDuplicateCandidates,
  summarizeDuplicateCandidateClusters,
  type CanonicalCampgroundRecord,
} from "@/worker/locations/duplicate-audit";
import { planAutomaticMergeClusters } from "@/worker/locations/automatic-merge-plan";

function campground(
  id: string,
  name: string,
  latitude: number,
  longitude: number,
  overrides: Partial<CanonicalCampgroundRecord> = {},
): CanonicalCampgroundRecord {
  return {
    id,
    name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    verification: "unverified",
    sourcePriority: 60,
    sourceCount: 1,
    reportCount: 0,
    country: "US",
    region: "WA",
    city: "Fixture",
    address: "Address not provided",
    website: null,
    phone: null,
    latitude,
    longitude,
    ...overrides,
  };
}

describe("canonical campground duplicate detection", () => {
  it("recognizes a generic KOA label as the named campground on the same page", () => {
    const website = "https://koa.com/campgrounds/lubbock/";
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000101",
        "Kampgrounds Of America",
        33.6359,
        -101.93137,
        { website: "http://koa.com/campgrounds/lubbock/" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000102",
        "Lubbock KOA Journey",
        33.63637,
        -101.93144,
        { website },
      ),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0]).toMatchObject({
      websiteMatch: true,
      recommendation: "automatic",
    });
  });

  it("automatically matches renamed campgrounds sharing a website and address", () => {
    const common = {
      website: "https://koa.com/campgrounds/ogallala/",
      address: "221 Road East 85",
    };
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000103",
        "Ogallala / I-80 KOA Journey",
        41.11295,
        -101.70861,
        common,
      ),
      campground(
        "00000000-0000-4000-8000-000000000104",
        "Ogallala / Lake McConaughy KOA Journey",
        41.114,
        -101.70822,
        common,
      ),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].recommendation).toBe("automatic");
  });

  it("finds campground-name variants at nearly identical coordinates", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000001",
        "Camp Sanders",
        47,
        -117,
      ),
      campground(
        "00000000-0000-4000-8000-000000000002",
        "Sanders Family Camp",
        47.0001,
        -117.0001,
      ),
      campground(
        "00000000-0000-4000-8000-000000000003",
        "Cabins by the Joe",
        47.1,
        -116.7,
      ),
      campground(
        "00000000-0000-4000-8000-000000000004",
        "RV and Cabins by the Joe",
        47.1001,
        -116.7001,
      ),
    ]);
    expect(candidates).toHaveLength(2);
    expect(
      candidates.every((candidate) => candidate.recommendation === "automatic"),
    ).toBe(true);
  });

  it("uses an exact campground website page to catch bad coordinates", () => {
    const website = "https://koa.com/campgrounds/starbuck/";
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000011",
        "Lyons Ferry Marina",
        46.6,
        -118.2,
        { website },
      ),
      campground(
        "00000000-0000-4000-8000-000000000012",
        "Starbuck / Lyons Ferry Marina KOA Holiday",
        46.75,
        -118.35,
        { website, verification: "source_verified", sourcePriority: 90 },
      ),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].websiteMatch).toBe(true);
    expect(candidates[0].distanceMeters).toBeGreaterThan(2_000);
    expect(candidates[0].suggestedSurvivorId).toBe(
      "00000000-0000-4000-8000-000000000012",
    );
  });

  it("does not merge distinct nearby names or different provider pages", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000021",
        "North Basin",
        48,
        -120,
      ),
      campground(
        "00000000-0000-4000-8000-000000000022",
        "South Basin",
        48.0001,
        -120.0001,
      ),
      campground(
        "00000000-0000-4000-8000-000000000023",
        "Starbuck KOA",
        47,
        -119,
        { website: "https://koa.com/campgrounds/starbuck/" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000024",
        "Seattle KOA",
        47.0001,
        -119.0001,
        { website: "https://koa.com/campgrounds/seattle/" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000025",
        "Ohanapecosh Campground",
        46.73,
        -121.57,
        { phone: "360-569-2211" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000026",
        "Ohanapecosh Group Campground",
        46.73,
        -121.57,
        { phone: "360-569-2211" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000027",
        "Tillie Creek #2 Group Campground",
        35.69,
        -118.45,
        { website: "https://www.fs.usda.gov/recarea/x/?recid=2" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000028",
        "Tillie Creek #4 Group Campground",
        35.69,
        -118.45,
        { website: "https://www.fs.usda.gov/recarea/x/?recid=4" },
      ),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("keeps adjacent service facilities and marinas separate from campgrounds", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000051",
        "Verlot Ranger Station-Public Service Center",
        48.0919,
        -121.781,
      ),
      campground(
        "00000000-0000-4000-8000-000000000052",
        "Verlot Campground",
        48.0902,
        -121.7758,
      ),
      campground(
        "00000000-0000-4000-8000-000000000053",
        "Bucksaw Resort and Marina",
        38.2634,
        -93.6032,
      ),
      campground(
        "00000000-0000-4000-8000-000000000054",
        "Bucksaw Campground",
        38.26,
        -93.6056,
      ),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("keeps opposing upper and lower facilities separate even with shared contact details", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000055",
        "Cove Creek Lower Group Camp",
        35.2997,
        -82.8164,
        { phone: "828-555-0100" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000056",
        "Cove Creek Upper Group Camp",
        35.2997,
        -82.8164,
        { phone: "828-555-0100" },
      ),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("keeps separately named subfacilities apart when they share central reservation details", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000061",
        "Ponderosa Group - Lake Isabel",
        37.9677,
        -105.0672,
        { phone: "Reservations: (877) 444-6777" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000062",
        "Spruce Group - Lake Isabel",
        37.9677,
        -105.0672,
        { phone: "Reservations: (877) 444-6777" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000063",
        "Pine Campsite - Wilgus State Park",
        43.39056,
        -72.40498,
        { website: "https://www.vtstateparks.com" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000064",
        "Hawthorn Campsite - Wilgus State Park",
        43.39042,
        -72.40509,
        { website: "https://www.vtstateparks.com" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000065",
        "Indianapolis Motor Speedway Camping Lot 6",
        39.798,
        -86.236,
        { website: "https://www.indianapolismotorspeedway.com" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000066",
        "Indianapolis Motor Speedway Lot 1C",
        39.804,
        -86.231,
        { website: "https://www.indianapolismotorspeedway.com" },
      ),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("does not queue weak name-only matches hundreds of metres apart", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000057",
        "Joseph Citta Scout Reservation at Brookville",
        39.7744,
        -74.309,
      ),
      campground(
        "00000000-0000-4000-8000-000000000058",
        "Brookville Campground",
        39.7785,
        -74.3005,
      ),
    ]);
    expect(candidates).toHaveLength(0);
  });

  it("retains nearly identical close names for manual review despite a regional mismatch", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000059",
        "Lower Twin Campground (VA)",
        37.235188,
        -82.378767,
        { region: "KY" },
      ),
      campground(
        "00000000-0000-4000-8000-000000000060",
        "Lower Twin Campground",
        37.235298,
        -82.378719,
        { region: "VA" },
      ),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].recommendation).toBe("review");
  });

  it("finds exact address and phone matches while preserving deterministic pair order", () => {
    const candidates = detectCanonicalDuplicateCandidates([
      campground(
        "00000000-0000-4000-8000-000000000032",
        "Pine Valley RV Park",
        49,
        -123,
        {
          address: "123 Forest Road",
          city: "Hope",
          region: "BC",
          country: "CA",
          phone: "+1 604 555 1212",
        },
      ),
      campground(
        "00000000-0000-4000-8000-000000000031",
        "Pine Valley Campground",
        49.03,
        -123.03,
        {
          address: "123 Forest Rd.",
          city: "Hope",
          region: "BC",
          country: "CA",
          phone: "604-555-1212",
        },
      ),
    ]);
    expect(candidates).toHaveLength(1);
    expect(candidates[0].left.id).toBe("00000000-0000-4000-8000-000000000031");
    expect(candidates[0]).toMatchObject({
      addressMatch: true,
      phoneMatch: true,
      recommendation: "automatic",
    });
  });

  it("collapses overlapping pairs into one review cluster", () => {
    const records = [
      campground(
        "00000000-0000-4000-8000-000000000041",
        "Cedar Ridge",
        48,
        -120,
      ),
      campground(
        "00000000-0000-4000-8000-000000000042",
        "Cedar Ridge Camp",
        48,
        -120,
      ),
      campground(
        "00000000-0000-4000-8000-000000000043",
        "Cedar Ridge RV",
        48,
        -120,
      ),
      campground(
        "00000000-0000-4000-8000-000000000044",
        "Pine Hollow",
        49,
        -121,
      ),
      campground(
        "00000000-0000-4000-8000-000000000045",
        "Pine Hollow Camp",
        49,
        -121,
      ),
    ];
    const summary = summarizeDuplicateCandidateClusters(
      detectCanonicalDuplicateCandidates(records),
    );
    expect(summary).toEqual({
      pairCount: 4,
      locationCount: 5,
      clusterCount: 2,
      clustersWithMoreThanTwoLocations: 1,
      largestClusterSize: 3,
    });
  });

  it("plans connected automatic pairs as one deterministic merge cluster", () => {
    const records = [
      campground(
        "00000000-0000-4000-8000-000000000061",
        "Pine Campground",
        48,
        -120,
      ),
      campground(
        "00000000-0000-4000-8000-000000000062",
        "Pine Campground",
        48,
        -120,
        {
          sourceCount: 2,
        },
      ),
      campground(
        "00000000-0000-4000-8000-000000000063",
        "Pine Campground",
        48,
        -120,
      ),
    ];
    const clusters = planAutomaticMergeClusters(
      detectCanonicalDuplicateCandidates(records),
    );
    expect(clusters).toHaveLength(1);
    expect(clusters[0].survivor.id).toBe(
      "00000000-0000-4000-8000-000000000062",
    );
    expect(clusters[0].duplicates.map((record) => record.id)).toEqual([
      "00000000-0000-4000-8000-000000000061",
      "00000000-0000-4000-8000-000000000063",
    ]);
    expect(clusters[0].pairCount).toBe(3);
  });
});
