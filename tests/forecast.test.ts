import { describe, expect, it } from "vitest";
import {
  FORECAST_FEATURES,
  type LogisticForecastModelArtifact,
  type ForecastModelArtifact,
} from "@/config/forecast";
import { createNorthAmericaGrid } from "@/worker/grid";
import { scoreForecast } from "@/worker/model";

const model: LogisticForecastModelArtifact = {
  kind: "logistic-regression",
  status: "trained",
  version: "test-1",
  trainedAt: "2026-01-01T00:00:00Z",
  usesUserReports: true,
  temporalHoldout: {
    start: "2025-01-01",
    end: "2025-12-31",
    auc: 0.7,
    brier: 0.2,
  },
  intercept: 0,
  coefficients: Object.fromEntries(
    FORECAST_FEATURES.map((feature) => [
      feature,
      feature === "temperature_2m_mean" ? 1 : 0,
    ]),
  ) as LogisticForecastModelArtifact["coefficients"],
  normalization: Object.fromEntries(
    FORECAST_FEATURES.map((feature) => [
      feature,
      { mean: 0, standardDeviation: 1 },
    ]),
  ) as LogisticForecastModelArtifact["normalization"],
  notes: "test",
};
const features = Object.fromEntries(
  FORECAST_FEATURES.map((feature) => [feature, 0]),
) as Parameters<typeof scoreForecast>[1];
describe("forecast infrastructure", () => {
  it("scores logistic regression deterministically", () => {
    expect(scoreForecast(model, features)).toBe(0.5);
    expect(
      scoreForecast(model, { ...features, temperature_2m_mean: 2 }),
    ).toBeGreaterThan(0.85);
  });
  it("builds stable unique geographic grid keys", () => {
    const grid = createNorthAmericaGrid(5);
    expect(grid.length).toBeGreaterThan(100);
    expect(new Set(grid.map((cell) => cell.key)).size).toBe(grid.length);
  });
  it("scores the weather-only beta artifact without report features", async () => {
    const beta = (
      await import("@/config/models/current.json", {
        with: { type: "json" },
      })
    ).default as ForecastModelArtifact;
    expect(beta.kind).toBe("weather-index-beta");
    expect(beta.usesUserReports).toBe(false);
    expect(
      scoreForecast(beta, {
        ...features,
        temperature_2m_mean: 26,
        relative_humidity_2m_mean: 80,
        dew_point_2m_mean: 18,
        precipitation_sum: 4,
        precipitation_7d: 25,
        soil_moisture_0_to_7cm_mean: 0.3,
        wind_speed_10m_mean: 4,
      }),
    ).toBeGreaterThan(0.7);
  });
});
