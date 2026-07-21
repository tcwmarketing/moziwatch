import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const config = JSON.parse(
  readFileSync("config/habitat-processing.json", "utf8"),
) as {
  kind: string;
  version: string;
  ringsM: number[];
  distanceRingWeights: number[];
  stagnantWaterWeights: Record<string, number>;
  fastStreamMinimumGradient: number;
  slowStreamMaximumGradient: number;
  sources: string[];
};

describe("North American habitat processing configuration", () => {
  it("is versioned and uses the required non-overlapping distance boundaries", () => {
    expect(config.kind).toBe("north-america-campground-habitat-profile");
    expect(config.version).toBe("habitat-north-america-v1");
    expect(config.ringsM).toEqual([250, 1000, 3000, 5000]);
    expect(
      config.distanceRingWeights.reduce((sum, value) => sum + value, 0),
    ).toBeCloseTo(1);
  });

  it("weights marsh more strongly than other wetland and excludes large open water", () => {
    expect(config.stagnantWaterWeights.marsh).toBeGreaterThan(
      config.stagnantWaterWeights.otherWetland,
    );
    expect(config.stagnantWaterWeights).not.toHaveProperty("largeOpenWater");
    expect(config.stagnantWaterWeights).not.toHaveProperty("fastRiver");
    expect(
      Object.values(config.stagnantWaterWeights).reduce(
        (sum, value) => sum + value,
        0,
      ),
    ).toBeCloseTo(1);
  });

  it("keeps fast and slow stream classifications distinct", () => {
    expect(config.fastStreamMinimumGradient).toBeGreaterThan(
      config.slowStreamMaximumGradient,
    );
  });

  it("declares continental baselines plus US, Canadian, and BC enrichment", () => {
    expect(config.sources).toEqual(
      expect.arrayContaining([
        "esa-worldcover-2021-v200",
        "jrc-global-surface-water-v1.4",
        "copernicus-dem-glo30-2021",
        "nasa-power-merra2-1991-2020",
        "cwim3a",
        "usfws-nwi",
        "bc-freshwater-atlas",
      ]),
    );
  });
});
