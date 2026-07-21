import { describe, expect, it } from "vitest";
import type { CampgroundHabitatProfile } from "@/config/forecast";
import type {
  CampgroundV3ModelArtifact,
  CampgroundV3WeatherOutlook,
  ForecastReport,
  V3WeatherHistoryDay,
} from "@/config/forecast-v3";
import v3Artifact from "@/config/models/v3.json";
import {
  activityForecast,
  blendForecast,
  environmentalForecast,
  historicalReportSignal,
  persistentWaterBalance,
  recentReportSignal,
  scoreCampgroundV3,
  staticHabitatSuitability,
} from "@/worker/model-v3";

const model = v3Artifact as unknown as CampgroundV3ModelArtifact;
const target = new Date("2026-07-15T20:00:00Z");
const generated = new Date("2026-07-15T23:00:00Z");
const rings = (near = 0, middle = 0, far = 0) => ({
  within250m: near,
  from250mTo1km: middle,
  from1kmTo5km: far,
  from1kmTo3km: far,
});

const habitat = (
  values: Partial<CampgroundHabitatProfile> = {},
): CampgroundHabitatProfile => ({
  profileVersion: "test-v1",
  dataKind: "measured-geospatial",
  wetlandCoverage: rings(0.2, 0.15, 0.1),
  marshCoverage: rings(0.15, 0.1, 0.05),
  seasonalWaterCoverage: rings(0.15, 0.1, 0.05),
  smallWaterBodyDensity: 0.25,
  stagnantWaterPotential: 0.3,
  lakeShorelineProximity: 0.1,
  shorelineWaterEdgeLengthKm: 0.4,
  largeOpenWaterCoverage: 0,
  fastRiverProximity: 0,
  slowRiverProximity: 0.1,
  forestCoverage: rings(0.5, 0.5, 0.5),
  vegetationCoverage: 0.6,
  elevationM: 400,
  slopeDegrees: 4,
  drainagePotential: 0.45,
  floodplainExposure: 0.1,
  annualRainfallMm: 700,
  warmSeasonRainfallMm: 250,
  landCoverType: "mixed forest",
  profileConfidence: 0.85,
  dataCoverage: { overall: 0.85, sources: [] },
  ...values,
});

function historyDay(
  daysAgo: number,
  values: Partial<V3WeatherHistoryDay> = {},
): V3WeatherHistoryDay {
  const date = new Date(target.getTime() - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return {
    date,
    temperatureMeanC: 22,
    temperatureMinC: 14,
    temperatureMaxC: 27,
    precipitationMm: 1.5,
    rainMm: 1.5,
    snowfallCm: 0,
    snowDepthM: 0,
    soilMoisture: 0.24,
    evapotranspirationMm: 2.2,
    ...values,
  };
}

const weather = (
  values: Partial<CampgroundV3WeatherOutlook> = {},
): CampgroundV3WeatherOutlook => ({
  targetDate: "2026-07-15",
  dayOffset: 0,
  history: Array.from({ length: 60 }, (_, index) => historyDay(60 - index)),
  hourly: Array.from({ length: 24 }, (_, hour) => ({
    time: `2026-07-15T${String(hour).padStart(2, "0")}:00`,
    temperatureC: hour >= 18 ? 22 : 25,
    relativeHumidity: 76,
    precipitationMm: 0,
    rainMm: 0,
    snowfallCm: 0,
    snowDepthM: 0,
    windSpeedKmh: 5,
    windGustKmh: 10,
    isDay: hour >= 6 && hour < 21,
  })),
  sunrise: "2026-07-15T05:15",
  sunset: "2026-07-15T21:10",
  weatherRunAt: "2026-07-15T11:45:00Z",
  completeness: 1,
  ...values,
});

function report(
  id: string,
  rating: number,
  daysAgo: number,
  values: Partial<ForecastReport> = {},
): ForecastReport {
  const observedAt = new Date(target.getTime() - daysAgo * 86_400_000);
  return {
    id,
    rating,
    observedAt,
    submittedAt: new Date(observedAt.getTime() + 3_600_000),
    accountVerified: true,
    anonymous: false,
    moderationStatus: "published",
    observationTimeKnown: false,
    ...values,
  };
}

describe("mosquito campground v3", () => {
  it("equals the environmental result when there are no reports", () => {
    const result = scoreCampgroundV3(
      model,
      habitat(),
      weather(),
      [],
      generated,
    );
    expect(result.finalForecast.riskIndex).toBeCloseTo(
      result.environmentalForecast.riskIndex,
      10,
    );
  });

  it("gives one anonymous report only a small effect", () => {
    const base = scoreCampgroundV3(model, habitat(), weather(), [], generated);
    const adjusted = scoreCampgroundV3(
      model,
      habitat(),
      weather(),
      [report("a", 5, 0.5, { accountVerified: false, anonymous: true })],
      generated,
    );
    expect(adjusted.recentReports.weight).toBeLessThan(0.1);
    expect(
      adjusted.finalForecast.riskIndex - base.finalForecast.riskIndex,
    ).toBeLessThan(8);
  });

  it("lets several consistent recent reports materially shift tonight", () => {
    const reports = [0.4, 1.2, 2.2, 3].map((age, index) =>
      report(`r${index}`, 5, age),
    );
    const result = scoreCampgroundV3(
      model,
      habitat(),
      weather(),
      reports,
      generated,
    );
    expect(result.recentReports.weight).toBeGreaterThan(0.2);
    expect(result.finalForecast.riskIndex).toBeGreaterThan(
      result.environmentalForecast.riskIndex + 8,
    );
  });

  it("decreases recent influence across the seven-day horizon", () => {
    const signal = recentReportSignal(
      model,
      [report("r", 5, 0.2)],
      target,
      generated,
    );
    const empty = historicalReportSignal(model, [], target, generated);
    expect(
      blendForecast(model, 40, signal, empty, 0).recentWeight,
    ).toBeGreaterThan(blendForecast(model, 40, signal, empty, 6).recentWeight);
  });

  it("gives insufficient historical evidence no weight", () => {
    const old = report("old", 5, 0);
    old.observedAt = new Date("2025-07-15T12:00:00Z");
    const signal = historicalReportSignal(model, [old], target, generated);
    expect(signal.confidence).toBe(0);
  });

  it("excludes historical reports from unrelated seasons", () => {
    const winter = report("winter", 5, 0);
    winter.observedAt = new Date("2025-01-15T12:00:00Z");
    expect(
      historicalReportSignal(model, [winter], target, generated).reportCount,
    ).toBe(0);
  });

  it("gives one old historical report little influence", () => {
    const old = report("old", 5, 0);
    old.observedAt = new Date("2019-07-15T12:00:00Z");
    expect(
      historicalReportSignal(model, [old], target, generated).confidence,
    ).toBe(0);
  });

  it("increases historical confidence with consistent reports across years", () => {
    const reports = [2025, 2024, 2023, 2022].flatMap((year) =>
      [1, 2].map((day) => {
        const item = report(`${year}-${day}`, 4, 0);
        item.observedAt = new Date(`${year}-07-${14 + day}T12:00:00Z`);
        return item;
      }),
    );
    const signal = historicalReportSignal(model, reports, target, generated);
    expect(signal.representedYears).toBe(4);
    expect(signal.confidence).toBeGreaterThan(0.25);
  });

  it("reduces recent confidence when reports conflict", () => {
    const consistent = [1, 2, 3, 4].map((age) => report(`c${age}`, 4, age));
    const conflicting = [1, 2, 3, 4].map((age, index) =>
      report(`x${age}`, index % 2 ? 5 : 1, age),
    );
    expect(
      recentReportSignal(model, conflicting, target, generated).confidence,
    ).toBeLessThan(
      recentReportSignal(model, consistent, target, generated).confidence,
    );
  });

  it("allows consistent reports to disagree with and shift environment", () => {
    const reports = [0.5, 1, 2, 3, 4].map((age) => report(`h${age}`, 5, age));
    const result = scoreCampgroundV3(
      model,
      habitat(),
      weather(),
      reports,
      generated,
    );
    expect(result.finalForecast.riskIndex).toBeGreaterThan(
      result.environmentalForecast.riskIndex,
    );
  });

  it("excludes rejected and duplicate reports", () => {
    const signal = recentReportSignal(
      model,
      [
        report("rejected", 5, 1, { moderationStatus: "rejected" }),
        report("duplicate", 5, 1, { duplicate: true }),
      ],
      target,
      generated,
    );
    expect(signal.reportCount).toBe(0);
  });

  it("does not count recent report ids again as historical", () => {
    const historical = report("same", 4, 0);
    historical.observedAt = new Date("2025-07-15T12:00:00Z");
    expect(
      historicalReportSignal(
        model,
        [historical],
        target,
        generated,
        new Set(["same"]),
      ).reportCount,
    ).toBe(0);
  });

  it("preserves the required environmental minimum", () => {
    const perfect = {
      ...recentReportSignal(model, [report("r", 5, 0)], target, generated),
      confidence: 1,
      signal: 100,
    };
    const historical = { ...perfect, representedYears: 5 };
    expect(
      blendForecast(model, 20, perfect, historical, 0).environmentalWeight,
    ).toBeGreaterThanOrEqual(0.25);
    expect(
      blendForecast(model, 20, perfect, historical, 6).environmentalWeight,
    ).toBeGreaterThanOrEqual(0.55);
  });

  it("suppresses hourly activity with wind without deleting population", () => {
    const calm = environmentalForecast(model, habitat(), weather());
    const windyWeather = weather({
      hourly: weather().hourly.map((hour) => ({
        ...hour,
        windSpeedKmh: 35,
        windGustKmh: 55,
      })),
    });
    const windy = environmentalForecast(model, habitat(), windyWeather);
    expect(windy.activityModifier).toBeLessThan(calm.activityModifier);
    expect(windy.populationPotential).toBeCloseTo(calm.populationPotential, 10);
  });

  it("suppresses activity during heavy current rain", () => {
    const clear = activityForecast(model, weather()).evening;
    const rainy = activityForecast(
      model,
      weather({
        hourly: weather().hourly.map((hour) => ({
          ...hour,
          precipitationMm: 6,
          rainMm: 6,
        })),
      }),
    ).evening;
    expect(rainy).toBeLessThan(clear * 0.3);
  });

  it("lets rain increase breeding conditions several days later", () => {
    const dry = weather({
      history: Array.from({ length: 60 }, (_, i) =>
        historyDay(60 - i, { precipitationMm: 0 }),
      ),
    });
    const lagged = weather({
      history: dry.history.map((day, i) => ({
        ...day,
        precipitationMm: i >= 47 && i <= 51 ? 8 : 0,
      })),
    });
    expect(
      environmentalForecast(model, habitat(), lagged).breedingCondition,
    ).toBeGreaterThan(
      environmentalForecast(model, habitat(), dry).breedingCondition,
    );
  });

  it("reduces breeding conditions after a long dry spell", () => {
    const wet = weather();
    const dry = weather({
      history: wet.history.map((day) => ({
        ...day,
        precipitationMm: 0,
        soilMoisture: 0.05,
        evapotranspirationMm: 5,
      })),
    });
    expect(
      environmentalForecast(model, habitat(), dry).breedingCondition,
    ).toBeLessThan(
      environmentalForecast(model, habitat(), wet).breedingCondition,
    );
  });

  it("retains water longer in wetlands than steep drained terrain", () => {
    const sameHistory = weather().history;
    const marsh = habitat({
      marshCoverage: rings(0.9, 0.8, 0.6),
      drainagePotential: 0.1,
      slopeDegrees: 1,
    });
    const slope = habitat({
      marshCoverage: rings(),
      drainagePotential: 0.95,
      slopeDegrees: 28,
    });
    expect(
      persistentWaterBalance(model, marsh, sameHistory).value,
    ).toBeGreaterThan(persistentWaterBalance(model, slope, sameHistory).value);
  });

  it("uses snowmelt for northern spring breeding conditions", () => {
    const spring = weather({
      targetDate: "2026-04-15",
      history: Array.from({ length: 60 }, (_, i) =>
        historyDay(60 - i, {
          temperatureMeanC: i > 50 ? 7 : -2,
          temperatureMinC: i > 50 ? 2 : -8,
          snowDepthM: i > 50 ? Math.max(0, 0.3 - (i - 50) * 0.04) : 0.3,
          precipitationMm: 0,
        }),
      ),
    });
    const noMelt = weather({
      ...spring,
      history: spring.history.map((day) => ({ ...day, snowDepthM: 0 })),
    });
    expect(
      persistentWaterBalance(model, habitat(), spring.history).value,
    ).toBeGreaterThan(
      persistentWaterBalance(model, habitat(), noMelt.history).value,
    );
  });

  it("produces different results from different weather histories", () => {
    const current = weather().hourly;
    const wet = weather({ hourly: current });
    const dry = weather({
      hourly: current,
      history: weather().history.map((day) => ({
        ...day,
        precipitationMm: 0,
        soilMoisture: 0.04,
      })),
    });
    expect(
      environmentalForecast(model, habitat(), wet).riskIndex,
    ).not.toBeCloseTo(
      environmentalForecast(model, habitat(), dry).riskIndex,
      3,
    );
  });

  it("does not keep a marsh high during freezing weather", () => {
    const marsh = habitat({ marshCoverage: rings(1, 0.9, 0.7) });
    const freezing = weather({
      hourly: weather().hourly.map((hour) => ({ ...hour, temperatureC: -3 })),
    });
    expect(environmentalForecast(model, marsh, freezing).riskIndex).toBe(0);
  });

  it("does not treat large open water like marsh", () => {
    const marsh = habitat({ marshCoverage: rings(0.9, 0.8, 0.6) });
    const lake = habitat({
      largeOpenWaterCoverage: 1,
      lakeShorelineProximity: 0,
    });
    expect(staticHabitatSuitability(model, marsh).score).toBeGreaterThan(
      staticHabitatSuitability(model, lake).score + 0.1,
    );
  });

  it("keeps observed ratings separate from prediction", () => {
    const result = scoreCampgroundV3(
      model,
      habitat(),
      weather(),
      [],
      generated,
      {
        recent: 4.2,
        historical: 3.4,
      },
    );
    expect(result.observed30DayRating).toBe(4.2);
    expect(result.observedHistoricalRating).toBe(3.4);
    expect(result.finalForecast.riskIndex).not.toBe(4.2);
  });

  it("is deterministic for the same inputs and configuration", () => {
    const site = habitat();
    const conditions = weather();
    const reports = [report("r", 4, 1)];
    expect(
      scoreCampgroundV3(model, site, conditions, reports, generated),
    ).toEqual(scoreCampgroundV3(model, site, conditions, reports, generated));
  });
});
