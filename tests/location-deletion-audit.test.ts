import { describe, expect, it } from "vitest";
import {
  detectLocationDeletionCandidate,
  type DeletionAuditRecord,
} from "@/worker/locations/deletion-audit";

function location(
  name: string,
  overrides: Partial<DeletionAuditRecord> = {},
): DeletionAuditRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    name,
    slug: name.toLowerCase().replace(/\W+/g, "-"),
    locationType: "developed_campground",
    address: "Address not provided",
    city: "Granite Falls",
    region: "WA",
    country: "US",
    website: null,
    phone: null,
    operationalStatus: "active",
    verificationStatus: "unverified",
    reportCount: 0,
    savedCount: 0,
    sources: [
      {
        source: "overture-us",
        authoritative: false,
        consecutiveMissingCount: 0,
        sourceRecordUrl: null,
      },
    ],
    ...overrides,
  };
}

describe("location deletion candidate audit", () => {
  it("flags a ranger station that was misclassified as a campground", () => {
    const candidate = detectLocationDeletionCandidate(
      location("Verlot Ranger Station-Public Service Center"),
    );
    expect(candidate).toMatchObject({
      confidence: 0.99,
      reasonCodes: ["non_campground_service_facility"],
    });
  });

  it("does not flag the actual nearby campground", () => {
    expect(
      detectLocationDeletionCandidate(
        location("Verlot Campground", {
          website: "https://www.fs.usda.gov/recarea/mbs/recarea/?recid=17846",
          sources: [
            {
              source: "usfs",
              authoritative: true,
              consecutiveMissingCount: 0,
              sourceRecordUrl:
                "https://www.fs.usda.gov/recarea/mbs/recarea/?recid=17846",
            },
          ],
        }),
      ),
    ).toBeNull();
  });

  it("does not flag a campground whose official name mentions a ranger station", () => {
    expect(
      detectLocationDeletionCandidate(
        location("Westwater Campground (Ranger Station)"),
      ),
    ).toBeNull();
    expect(
      detectLocationDeletionCandidate(
        location("Westwater Group Site (Ranger Station)"),
      ),
    ).toBeNull();
  });

  it("flags an unverified generic Overture city camping label", () => {
    const candidate = detectLocationDeletionCandidate(
      location("Camping Bromont", {
        city: "Bromont",
        country: "CA",
        region: "QC",
        sources: [
          {
            source: "overture-ca",
            authoritative: false,
            consecutiveMissingCount: 0,
            sourceRecordUrl: null,
          },
        ],
      }),
    );
    expect(candidate).toMatchObject({
      confidence: 0.76,
      reasonCodes: ["unverified_generic_overture_location"],
    });
  });

  it("does not flag a verified campground or a real RV park", () => {
    expect(
      detectLocationDeletionCandidate(
        location("Bucksaw Campground", {
          address: "673 SE 803rd Rd",
          website: "https://www.recreation.gov/camping/campgrounds/233441",
        }),
      ),
    ).toBeNull();
    expect(
      detectLocationDeletionCandidate(
        location("RV Self-Park", {
          address: "4045 N Service Rd W",
          website: "https://www.rvselfpark.com/Park/Sullivan-Missouri",
        }),
      ),
    ).toBeNull();
  });

  it("reduces confidence when user data exists", () => {
    const candidate = detectLocationDeletionCandidate(
      location("Lakeside Visitor Center", { reportCount: 2 }),
    );
    expect(candidate?.confidence).toBe(0.82);
    expect(candidate?.reasonCodes).toContain("has_user_data");
  });
});
