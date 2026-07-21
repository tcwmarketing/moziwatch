import { describe, expect, it } from "vitest";
import {
  compactOvertureRawPayload,
  overtureRetentionReason,
} from "@/worker/locations/overture-retention";
import {
  compactRawPayload,
  compactStoredNormalizedPayload,
  retainedContacts,
  retainedSourceGeometry,
} from "@/worker/locations/storage-retention";
import {
  compactProvenance,
  provenancePriority,
} from "@/worker/locations/provenance";

describe("Overture campground retention", () => {
  it("removes alternate-category-only and low-confidence places", () => {
    expect(
      overtureRetentionReason({
        name: "Lakeview Resort",
        primaryCategory: "resort",
        confidence: 0.99,
      }),
    ).toBe("alternate_category_only");
    expect(
      overtureRetentionReason({
        name: "Pine Campground",
        primaryCategory: "campground",
        confidence: 0.69,
      }),
    ).toBe("low_source_confidence");
  });

  it("keeps camp-named locations when they otherwise meet the policy", () => {
    expect(
      overtureRetentionReason({
        name: "Nameless Creek Youth Camp",
        primaryCategory: "campground",
        confidence: 0.91,
      }),
    ).toBeNull();
    expect(
      overtureRetentionReason({
        name: "Island Park Scout Camp",
        primaryCategory: "campground",
        confidence: 0.77,
      }),
    ).toBeNull();
  });

  it("removes conference centres and unmistakable non-campground businesses", () => {
    expect(
      overtureRetentionReason({
        name: "Trinity Pines Camp and Conference Center",
        primaryCategory: "campground",
        confidence: 0.97,
      }),
    ).toBe("conference_or_retreat_centre");
    expect(
      overtureRetentionReason({
        name: "Town View Mobile Home Park",
        primaryCategory: "campground",
        confidence: 0.92,
      }),
    ).toBe("residential_community");
    expect(
      overtureRetentionReason({
        name: "Gander RV Dealer",
        primaryCategory: "campground",
        confidence: 0.95,
      }),
    ).toBe("retail_or_service_business");
    expect(
      overtureRetentionReason({
        name: "Verlot Ranger Station Public Service Center",
        primaryCategory: "campground",
        confidence: 0.95,
      }),
    ).toBe("non_campground_facility");
  });

  it("retains only the Overture fields needed for future classification", () => {
    expect(
      compactOvertureRawPayload({
        id: "large-duplicated-id",
        name: "Pine Campground",
        primary_category: "campground",
        alternate_categories: ["park"],
        confidence: 0.91,
        operating_status: "open",
        version: 7,
        sources: [{ dataset: "large-provider-payload" }],
        longitude: -120,
        latitude: 50,
        overtureRelease: "2026-06-17.0",
      }),
    ).toEqual({
      primary_category: "campground",
      alternate_categories: ["park"],
      confidence: 0.91,
      operating_status: "open",
      version: 7,
    });
  });

  it("retains operational fields without retaining a complete provider response", () => {
    expect(
      compactRawPayload("bc-recreation", {
        NUM_CAMP_SITES: 42,
        MAINTAIN_STD_DESC: "Maintained",
        STRUCTURE_DESC1: "Toilet",
        PROJECT_DESCRIPTION: "A very long description",
        DRIVING_DIRECTIONS: "A very long set of directions",
      }),
    ).toEqual({
      NUM_CAMP_SITES: 42,
      MAINTAIN_STD_DESC: "Maintained",
      STRUCTURE_DESC1: "Toilet",
    });
  });

  it("extracts and preserves emails and URLs before compacting raw data", () => {
    expect(
      retainedContacts({
        raw: {
          FacilityEmail: "Camp@Example.com",
          MEDIA: [
            { URL: "https://images.example.com/camp.jpg", title: "Photo" },
          ],
        },
        sourceUrl: "https://example.com/source",
        sourceRecordUrl: null,
        website: "https://example.com/camp",
        reservationUrl: "https://reserve.example.com/camp",
      }),
    ).toEqual({
      emails: ["camp@example.com"],
      urls: [
        "https://example.com/camp",
        "https://example.com/source",
        "https://images.example.com/camp.jpg",
        "https://reserve.example.com/camp",
      ],
    });
  });

  it("drops unused descriptions and duplicate point geometry", () => {
    expect(
      compactStoredNormalizedPayload({
        name: "Pine Campground",
        website: "https://example.com",
        description: "Not displayed",
        unusedProviderField: "unused",
      }),
    ).toEqual({
      name: "Pine Campground",
      website: "https://example.com",
    });
    expect(
      retainedSourceGeometry({ type: "Point", coordinates: [-120, 50] }),
    ).toBeNull();
    expect(
      retainedSourceGeometry({
        type: "Polygon",
        coordinates: [[[-120, 50]]],
      }),
    ).toEqual({ type: "Polygon", coordinates: [[[-120, 50]]] });
  });

  it("stores one default provenance source plus field exceptions", () => {
    const provenance = compactProvenance({
      name: ["ridb", 80],
      city: { source: "ridb", priority: 80 },
      coordinates: ["ridb", 80],
      website: ["admin-manual", 100],
    });
    expect(provenance).toEqual({
      _: ["ridb", 80],
      website: ["admin-manual", 100],
    });
    expect(provenancePriority(provenance, "city")).toBe(80);
    expect(provenancePriority(provenance, "website")).toBe(100);
  });
});
