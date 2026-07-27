import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ForecastCard } from "@/components/forecast-card";
import {
  FORECAST_RING_MIN_ZOOM,
  forecastDisplayState,
  forecastDisplayStateForScore,
} from "@/config/forecast-display";

describe("forecast presentation", () => {
  it("maps the provisional risk score to a separate forecast display state", () => {
    expect(forecastDisplayStateForScore(0.1).label).toBe("None or minimal");
    expect(forecastDisplayStateForScore(0.5).label).toBe("Moderate");
    expect(forecastDisplayStateForScore(0.9).label).toBe("Severe");
    expect(forecastDisplayStateForScore(null).label).toBe("Unavailable");
  });

  it("uses the stored model label before fallback score thresholds", () => {
    expect(forecastDisplayState(0.3, "Moderate").color).toBe("#B88600");
    expect(forecastDisplayState(0.3, "Light").color).toBe("#6F8F3D");
    expect(forecastDisplayState(0.8, "Very high").color).toBe("#8F2D2D");
  });

  it("labels a current forecast as modeled rather than a camper rating", () => {
    const markup = renderToStaticMarkup(
      <ForecastCard score={0.62} level="Heavy" confidence={0.74} />,
    );

    expect(markup).toContain("Today&#x27;s forecast");
    expect(markup).toContain("Heavy");
    expect(markup).toContain("62/100");
    expect(markup).toContain("74% confidence · modeled outlook");
    expect(markup).not.toContain("reports");
  });

  it("keeps forecast rings at local zoom", () => {
    expect(FORECAST_RING_MIN_ZOOM).toBeGreaterThan(8);
  });
});
