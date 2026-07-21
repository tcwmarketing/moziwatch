import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CAMPGROUND_WEATHER_CACHE_HOURS,
  weatherCodePresentation,
} from "@/config/weather";
import { OpenMeteoProvider } from "@/worker/providers/open-meteo";

afterEach(() => vi.unstubAllGlobals());

describe("on-demand campground weather", () => {
  it("reuses a visitor-triggered forecast for twelve hours", () => {
    expect(CAMPGROUND_WEATHER_CACHE_HOURS).toBe(12);
  });

  it("maps WMO weather codes to plain-language conditions", () => {
    expect(weatherCodePresentation(0).label).toBe("Clear");
    expect(weatherCodePresentation(63).label).toBe("Rain");
    expect(weatherCodePresentation(75).label).toBe("Snow");
  });

  it("requests and normalizes only five daily forecast records", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () =>
        Response.json({
          timezone: "America/Vancouver",
          timezone_abbreviation: "PDT",
          daily: {
            time: [
              "2026-07-15",
              "2026-07-16",
              "2026-07-17",
              "2026-07-18",
              "2026-07-19",
            ],
            weather_code: [0, 2, 61, 3, 80],
            temperature_2m_max: [25, 24, 21, 23, 20],
            temperature_2m_min: [13, 12, 11, 10, 9],
            precipitation_sum: [0, 0, 4.2, 0.3, 6.1],
            wind_speed_10m_max: [8, 10, 14, 12, 18],
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenMeteoProvider("https://api.open-meteo.com/v1");
    const forecast = await provider.fetchFiveDayWeather({
      latitude: 49.9,
      longitude: -119.5,
    });
    const requested = new URL(String(fetchMock.mock.calls[0][0]));

    expect(requested.pathname).toBe("/v1/forecast");
    expect(requested.searchParams.get("forecast_days")).toBe("5");
    expect(requested.searchParams.get("timezone")).toBe("auto");
    expect(requested.searchParams.has("hourly")).toBe(false);
    expect(requested.searchParams.has("apikey")).toBe(false);
    expect(forecast.days).toHaveLength(5);
    expect(forecast.days[2]).toMatchObject({
      weatherCode: 61,
      precipitationMm: 4.2,
      temperatureMaxC: 21,
    });
  });
});
