import { describe, expect, it } from "vitest";
import { inferBcParksLocality } from "@/worker/locations/bc-locality";

describe("BC Parks locality inference", () => {
  it("uses the closest named community when the source provides one", () => {
    expect(
      inferBcParksLocality({
        latitude: 49.928836,
        longitude: -119.516802,
        locationNotes:
          "The closest communities, towns, and cities are Kelowna, Westbank, and Vernon.",
      }),
    ).toBe("Kelowna");
  });

  it("recognizes a nearby community from a distance description", () => {
    expect(
      inferBcParksLocality({
        latitude: 49.109469,
        longitude: -118.98043,
        locationNotes: "Located 5 km north of Rock Creek on Highway 33.",
      }),
    ).toBe("Rock Creek");
  });

  it("preserves abbreviations in community names", () => {
    expect(
      inferBcParksLocality({
        latitude: 56.2,
        longitude: -120.9,
        protectedAreaName: "Charlie Lake Park",
        locationNotes: "The closest city is Fort St. John.",
      }),
    ).toBe("Fort St. John");
  });

  it("does not mistake a highway for a community", () => {
    expect(
      inferBcParksLocality({
        latitude: 49.2,
        longitude: -115.2,
        protectedAreaName: "Example Park",
        locationNotes: "The park is 3 km east of Hwy 93.",
      }),
    ).toBe("Kootenay");
  });

  it("uses a named geographic area when no community is available", () => {
    expect(
      inferBcParksLocality({
        latitude: 49.8,
        longitude: -116.9,
        description: "A forest campground in the Kootenay region.",
      }),
    ).toBe("Kootenay");
  });

  it("always gives a useful BC area when the source text is generic", () => {
    expect(inferBcParksLocality({ latitude: 50.1, longitude: -119.5 })).toBe(
      "Okanagan–Boundary",
    );
  });
});
