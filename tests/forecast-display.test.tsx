import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { ForecastCard } from "@/components/forecast-card";
import {
  forecastDisplayState,
  forecastDisplayStateForScore,
} from "@/config/forecast-display";
import { createSplitMarkerImage, splitMarkerImageId } from "@/lib/map-marker";

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

  it("renders an unavailable forecast with a neutral state", () => {
    const markup = renderToStaticMarkup(
      <ForecastCard score={null} level={null} confidence={null} />,
    );

    expect(markup).toContain("forecast-card-unavailable");
    expect(markup).toContain("--forecast-color:#7B8580");
    expect(markup).toContain("No current modeled forecast");
    expect(markup).not.toContain("--forecast-color:#E9A617");
  });

  it("creates a stable split marker image ID", () => {
    expect(splitMarkerImageId("#7B8580", "#B88600")).toBe(
      "campground-split-7B8580-B88600",
    );
  });

  it("renders reports on the left and forecasts on the right", () => {
    const image = createSplitMarkerImage("#7B8580", "#B88600");
    const pixel = (x: number, y: number) => {
      const offset = (y * image.width + x) * 4;
      return Array.from(image.data.slice(offset, offset + 4));
    };

    expect(pixel(12, 24)).toEqual([123, 133, 128, 255]);
    expect(pixel(36, 24)).toEqual([184, 134, 0, 255]);
    expect(pixel(23, 24)).toEqual([255, 255, 255, 255]);
    expect(pixel(0, 0)).toEqual([0, 0, 0, 0]);
  });

  it("uses a MapLibre-valid split marker symbol layer", () => {
    const errors = validateStyleMin({
      version: 8,
      sources: {
        campgrounds: {
          type: "geojson",
          data: { type: "FeatureCollection", features: [] },
        },
      },
      layers: [
        {
          id: "campground-markers",
          type: "symbol",
          source: "campgrounds",
          layout: {
            "icon-image": ["get", "split_marker_id"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          },
        },
      ],
    });

    expect(errors.map((error) => error.message)).toEqual([]);
  });
});
