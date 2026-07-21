import { describe, expect, it } from "vitest";
import {
  MAP_CLUSTER_MAX_ZOOM,
  MAP_CLUSTER_MIN_COUNT,
  mapClusterCellSizeDegrees,
  mapLocationScope,
  mapViewportCovers,
  shouldGroupMapLocations,
} from "@/lib/map-query";

describe("campground map query levels", () => {
  it("defaults map coverage to verified locations", () => {
    expect(mapLocationScope(null)).toBe("verified");
    expect(mapLocationScope("unexpected")).toBe("verified");
    expect(mapLocationScope("all")).toBe("all");
  });

  it("uses progressively smaller server cluster cells while zooming in", () => {
    expect(mapClusterCellSizeDegrees(2)).toBe(11.25);
    expect(mapClusterCellSizeDegrees(5)).toBe(1.40625);
    expect(mapClusterCellSizeDegrees(MAP_CLUSTER_MAX_ZOOM)).toBeCloseTo(
      0.17578125,
    );
  });

  it("clamps extreme zoom values to safe cell sizes", () => {
    expect(mapClusterCellSizeDegrees(-20)).toBe(45);
    expect(mapClusterCellSizeDegrees(30)).toBe(0.04);
  });

  it("shows groups of three or fewer campgrounds as individual locations", () => {
    expect(MAP_CLUSTER_MIN_COUNT).toBe(4);
    expect(shouldGroupMapLocations(1)).toBe(false);
    expect(shouldGroupMapLocations(3)).toBe(false);
    expect(shouldGroupMapLocations(4)).toBe(true);
  });

  it("reuses a cached viewport only when it covers the requested area", () => {
    const cached = { west: -130, south: 40, east: -110, north: 55 };
    expect(
      mapViewportCovers(cached, {
        west: -125,
        south: 45,
        east: -115,
        north: 50,
      }),
    ).toBe(true);
    expect(
      mapViewportCovers(cached, {
        west: -135,
        south: 45,
        east: -115,
        north: 50,
      }),
    ).toBe(false);
  });
});
