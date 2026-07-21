import { describe, expect, it } from "vitest";
import { overturePublicationDecision } from "@/worker/locations/overture-verification";

const base = {
  confidence: 0.96,
  website: null,
  primaryCategory: "campground",
  operatingStatus: "open",
};

describe("conservative Overture publication", () => {
  it.each([
    "Bow River Campground",
    "Cedar Vue Campground",
    "Lubbock KOA Journey",
    "Prairie Camping Area",
  ])("publishes an explicit established campground: %s", (name) => {
    expect(overturePublicationDecision({ ...base, name })).toMatchObject({
      publish: true,
    });
  });

  it.each([
    "Camp Chief Hector",
    "British Swim School",
    "Verlot Ranger Station Public Service Center",
    "Clearwater Trading Post",
    "Pine Lake Conference Centre",
  ])("keeps ambiguous or non-campground records staged: %s", (name) => {
    expect(overturePublicationDecision({ ...base, name })).toMatchObject({
      publish: false,
    });
  });

  it("uses the lower confidence threshold only when a website is present", () => {
    const evidence = {
      ...base,
      name: "County View Campground",
      confidence: 0.85,
    };
    expect(overturePublicationDecision(evidence).publish).toBe(false);
    expect(
      overturePublicationDecision({
        ...evidence,
        website: "https://example.test",
      }).publish,
    ).toBe(true);
  });

  it("requires campground to be the primary category", () => {
    expect(
      overturePublicationDecision({
        ...base,
        name: "Pine Campground",
        primaryCategory: "park",
      }).publish,
    ).toBe(false);
  });

  it("publishes an RV-named facility only when its website confirms camping", () => {
    expect(
      overturePublicationDecision({
        ...base,
        name: "Twin Pines RV",
        confidence: 0.94,
        website: "https://twinpinesrv.example/rv-camping/",
      }),
    ).toMatchObject({
      publish: true,
      reason: "eligible_web_supported_camping_facility",
    });
    expect(
      overturePublicationDecision({
        ...base,
        name: "Twin Pines RV",
        website: null,
      }).publish,
    ).toBe(false);
  });
});
