import { describe, expect, it } from "vitest";
import type {
  CampgroundBetaForecastModelArtifact,
  CampgroundHabitatProfile,
  CampgroundMonthlyForecastModelArtifact,
  CampgroundWeatherOutlook,
} from "@/config/forecast";
import currentModel from "@/config/models/current.json";
import monthlyModelArtifact from "@/config/models/monthly.json";
import { decideForecastCadence } from "@/config/forecast-scheduling";
import { markerStateForAverage } from "@/config/ratings";
import {
  habitatSuitability,
  scoreCampgroundForecast,
  scoreCampgroundMonthlyOutlook,
} from "@/worker/model";

const model = currentModel as CampgroundBetaForecastModelArtifact;
const monthlyModel =
  monthlyModelArtifact as CampgroundMonthlyForecastModelArtifact;
const rings = (
  within250m: number,
  from250mTo1km: number,
  from1kmTo5km: number,
) => ({
  within250m,
  from250mTo1km,
  from1kmTo5km,
});

const habitat = (
  values: Partial<CampgroundHabitatProfile> = {},
): CampgroundHabitatProfile => ({
  profileVersion: "test-profile-v1",
  dataKind: "measured-geospatial",
  wetlandCoverage: rings(0, 0, 0),
  marshCoverage: rings(0, 0, 0),
  seasonalWaterCoverage: rings(0, 0, 0),
  smallWaterBodyDensity: 0,
  stagnantWaterPotential: 0,
  lakeShorelineProximity: 0,
  largeOpenWaterCoverage: 0,
  fastRiverProximity: 0,
  slowRiverProximity: 0,
  forestCoverage: rings(0.3, 0.3, 0.3),
  vegetationCoverage: 0.4,
  elevationM: 400,
  slopeDegrees: 5,
  drainagePotential: 0.5,
  annualRainfallMm: 600,
  warmSeasonRainfallMm: 220,
  landCoverType: "mixed forest",
  profileConfidence: 0.85,
  ...values,
});
const weather = (
  values: Partial<CampgroundWeatherOutlook> = {},
): CampgroundWeatherOutlook => ({
  targetDate: "2026-07-15",
  dayOffset: 0,
  temperatureMeanC: 24,
  overnightLowC: 16,
  relativeHumidityMean: 78,
  dewPointMeanC: 17,
  precipitationMm: 0,
  precipitation24hMm: 0,
  precipitation3dMm: 6,
  precipitation7dMm: 15,
  precipitation14dMm: 24,
  soilMoisture: 0.25,
  windSpeedKmh: 5,
  activePrecipitationMm: 0,
  seasonality: 1,
  eveningActivity: 0.8,
  ...values,
});

describe("campground forecast beta model", () => {
  it("weights wetlands more strongly than large open water", () => {
    const wetland = habitat({
      wetlandCoverage: rings(0.85, 0.7, 0.5),
      marshCoverage: rings(0.8, 0.65, 0.4),
    });
    const lake = habitat({
      lakeShorelineProximity: 1,
      largeOpenWaterCoverage: 1,
    });
    expect(habitatSuitability(model, wetland).score).toBeGreaterThan(
      habitatSuitability(model, lake).score + 0.15,
    );
  });

  it("does not weight a fast river like a marsh", () => {
    const fastRiver = habitat({ fastRiverProximity: 1 });
    const marsh = habitat({ marshCoverage: rings(1, 0.8, 0.5) });
    expect(habitatSuitability(model, marsh).score).toBeGreaterThan(
      habitatSuitability(model, fastRiver).score + 0.1,
    );
  });

  it("carries rainfall lag into later forecast periods", () => {
    const dry = scoreCampgroundForecast(
      model,
      habitat(),
      weather({
        dayOffset: 4,
        precipitation3dMm: 0,
        precipitation7dMm: 0,
        precipitation14dMm: 0,
      }),
    );
    const laggedRain = scoreCampgroundForecast(
      model,
      habitat(),
      weather({
        dayOffset: 4,
        precipitation3dMm: 18,
        precipitation7dMm: 38,
        precipitation14dMm: 55,
      }),
    );
    expect(laggedRain.score).toBeGreaterThan(dry.score);
    expect(laggedRain.components.rainfallLag).toBeGreaterThan(
      dry.components.rainfallLag,
    );
  });

  it("suppresses short-term activity in strong wind", () => {
    const calm = scoreCampgroundForecast(model, habitat(), weather());
    const windy = scoreCampgroundForecast(
      model,
      habitat(),
      weather({ windSpeedKmh: 36 }),
    );
    expect(windy.score).toBeLessThan(calm.score - 0.1);
    expect(windy.factors.join(" ")).toMatch(/wind/i);
  });

  it("can give nearby campgrounds different forecasts from habitat", () => {
    const wet = scoreCampgroundForecast(
      model,
      habitat({
        wetlandCoverage: rings(0.9, 0.8, 0.5),
        stagnantWaterPotential: 0.9,
      }),
      weather(),
    );
    const drained = scoreCampgroundForecast(
      model,
      habitat({
        drainagePotential: 0.95,
        vegetationCoverage: 0.1,
        forestCoverage: rings(0.05, 0.05, 0.1),
        landCoverType: "urban developed",
      }),
      weather(),
    );
    expect(wet.score).toBeGreaterThan(drained.score);
  });

  it("keeps modeled forecasts separate from actual report markers", () => {
    expect(model.usesUserReports).toBe(false);
    const reportMarkerBefore = markerStateForAverage(4.2);
    scoreCampgroundForecast(model, habitat(), weather());
    expect(markerStateForAverage(4.2)).toEqual(reportMarkerBefore);
  });
});

describe("monthly campground outlook beta model", () => {
  const climate = {
    targetMonth: "2026-07-01",
    monthOffset: 2,
    seasonality: 1,
    temperatureMeanC: 22,
    temperatureAnomalyC: 0,
    precipitationMm: 48,
    precipitationAnomalyMm: 0,
  };

  it("uses seasonal anomalies without using camper reports", () => {
    const typical = scoreCampgroundMonthlyOutlook(
      monthlyModel,
      model,
      habitat(),
      climate,
    );
    const warmerWetter = scoreCampgroundMonthlyOutlook(
      monthlyModel,
      model,
      habitat(),
      {
        ...climate,
        temperatureAnomalyC: 2,
        precipitationAnomalyMm: 35,
      },
    );
    expect(monthlyModel.usesUserReports).toBe(false);
    expect(warmerWetter.score).toBeGreaterThan(typical.score);
    expect(warmerWetter.factors.join(" ")).toMatch(/warmer|wetter/i);
  });

  it("reduces confidence as the monthly horizon grows", () => {
    const near = scoreCampgroundMonthlyOutlook(monthlyModel, model, habitat(), {
      ...climate,
      monthOffset: 0,
    });
    const far = scoreCampgroundMonthlyOutlook(monthlyModel, model, habitat(), {
      ...climate,
      monthOffset: 6,
    });
    expect(far.confidence).toBeLessThan(near.confidence);
  });
});

describe("forecast refresh cadence", () => {
  const base = {
    active: true,
    operatingStatus: "active",
    hasHabitatProfile: true,
    officialCampsites: 12,
    recentReport: false,
    savedUsers: 0,
    detailViews30d: 0,
    requestedRecently: false,
  };

  it("keeps low-interest established campgrounds weekly", () => {
    expect(decideForecastCadence(base).cadence).toBe("weekly");
  });

  it("promotes notable or recently requested campgrounds to daily", () => {
    expect(
      decideForecastCadence({ ...base, officialCampsites: 80 }).cadence,
    ).toBe("daily");
    expect(
      decideForecastCadence({ ...base, requestedRecently: true }).cadence,
    ).toBe("daily");
  });

  it("pauses unsupported or closed campgrounds", () => {
    expect(
      decideForecastCadence({ ...base, hasHabitatProfile: false }).cadence,
    ).toBe("paused");
    expect(
      decideForecastCadence({ ...base, operatingStatus: "closed" }).cadence,
    ).toBe("paused");
  });
});
