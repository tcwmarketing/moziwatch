import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoProvider } from "@/worker/providers/open-meteo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoProvider", () => {
  it("uses the forecast endpoint and calculates the current shallow-soil mean", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () =>
        Response.json({
          latitude: 49.25,
          longitude: -123.1,
          elevation: 70,
          daily: {
            temperature_2m_mean: [18, 19],
            relative_humidity_2m_mean: [65, 70],
            dew_point_2m_mean: [11, 12],
            precipitation_sum: [4, 2],
            wind_speed_10m_mean: [8, 6],
          },
          hourly: {
            soil_moisture_0_to_7cm: [
              ...Array.from({ length: 24 }, () => 0.1),
              ...Array.from({ length: 24 }, () => 0.3),
            ],
          },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenMeteoProvider("https://api.open-meteo.com/v1");
    const [result] = await provider.fetchCurrentDay(
      [{ key: "cell", latitude: 49.25, longitude: -123.1 }],
      "2026-07-14",
    );

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestedUrl.pathname).toBe("/v1/forecast");
    expect(requestedUrl.searchParams.get("hourly")).toBe(
      "soil_moisture_0_to_7cm",
    );
    expect(result.variables.soil_moisture_0_to_7cm_mean).toBeCloseTo(0.3);
    expect(result.variables.precipitation_7d).toBe(4);
    expect(result.raw.sourceModel).toBe("Open-Meteo Forecast API");
  });

  it("accepts a complete endpoint without duplicating its path", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () => Response.json({ daily: {}, hourly: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenMeteoProvider(
      "https://customer-api.open-meteo.com/v1/ecmwf",
    );

    await provider.fetchCurrentDay(
      [{ key: "cell", latitude: 1, longitude: 2 }],
      "2026-07-14",
    );

    expect(new URL(String(fetchMock.mock.calls[0][0])).pathname).toBe(
      "/v1/ecmwf",
    );
  });

  it("uses the reserved customer hosts automatically when an API key exists", async () => {
    const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>(
      async () => Response.json({ daily: {}, hourly: {} }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenMeteoProvider(
      "https://api.open-meteo.com/v1/forecast",
      "fixture-key",
    );

    await provider.fetchCurrentDay(
      [{ key: "cell", latitude: 1, longitude: 2 }],
      "2026-07-14",
    );

    const request = new URL(String(fetchMock.mock.calls[0][0]));
    expect(request.hostname).toBe("customer-api.open-meteo.com");
    expect(request.searchParams.get("apikey")).toBe("fixture-key");
  });

  it("retries a rate-limited request using the provider retry hint", async () => {
    const payload = {
      daily: {
        temperature_2m_mean: [18],
        relative_humidity_2m_mean: [65],
        dew_point_2m_mean: [11],
        precipitation_sum: [2],
        wind_speed_10m_mean: [8],
      },
      hourly: { soil_moisture_0_to_7cm: Array(24).fill(0.2) },
    };
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockResolvedValueOnce(
        new Response(null, {
          status: 429,
          headers: { "retry-after": "0.001" },
        }),
      )
      .mockResolvedValueOnce(Response.json(payload));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new OpenMeteoProvider(
      "https://api.open-meteo.com/v1/forecast",
    );
    const [result] = await provider.fetchCurrentDay(
      [{ key: "cell", latitude: 49.25, longitude: -123.1 }],
      "2026-07-14",
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.variables.soil_moisture_0_to_7cm_mean).toBeCloseTo(0.2);
  });

  it("splits compact 60-day history from the eight-day hourly forecast", async () => {
    const dates = Array.from({ length: 76 }, (_, index) =>
      new Date(Date.UTC(2026, 4, 16 + index)).toISOString().slice(0, 10),
    );
    const historyDates = dates.slice(0, 60);
    const forecastDates = dates.slice(60);
    const hourlyTimes = Array.from(
      { length: 24 },
      (_, hour) => `2026-07-15T${String(hour).padStart(2, "0")}:00`,
    );
    const daily = Object.fromEntries(
      [
        "temperature_2m_mean",
        "temperature_2m_min",
        "temperature_2m_max",
        "relative_humidity_2m_mean",
        "dew_point_2m_mean",
        "precipitation_sum",
        "rain_sum",
        "snowfall_sum",
        "et0_fao_evapotranspiration",
        "wind_speed_10m_mean",
      ].map((key) => [key, Array.from({ length: 76 }, () => 12)]),
    );
    const hourly = Object.fromEntries(
      [
        "temperature_2m",
        "relative_humidity_2m",
        "precipitation",
        "rain",
        "snowfall",
        "snow_depth",
        "soil_moisture_0_to_7cm",
        "wind_speed_10m",
        "wind_gusts_10m",
        "is_day",
      ].map((key) => [
        key,
        Array.from({ length: 24 }, () => (key === "is_day" ? 1 : 12)),
      ]),
    );
    const historyDaily = Object.fromEntries(
      Object.entries(daily).map(([key, values]) => [
        key,
        (values as number[]).slice(0, 60),
      ]),
    );
    const forecastDaily = Object.fromEntries(
      Object.entries(daily).map(([key, values]) => [
        key,
        (values as number[]).slice(60),
      ]),
    );
    const fetchMock = vi
      .fn<(input: RequestInfo | URL) => Promise<Response>>()
      .mockResolvedValueOnce(
        Response.json({
          daily: {
            time: historyDates,
            ...historyDaily,
          },
          hourly: {
            time: historyDates.map((date) => `${date}T12:00`),
            snow_depth: historyDates.map(() => 0),
            soil_moisture_0_to_7cm: historyDates.map(() => 0.25),
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          daily: {
            time: forecastDates,
            ...forecastDaily,
            sunrise: forecastDates.map((date) => `${date}T05:00`),
            sunset: forecastDates.map((date) => `${date}T21:00`),
          },
          hourly: { time: hourlyTimes, ...hourly },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const provider = new OpenMeteoProvider(
      "https://api.open-meteo.com/v1/forecast",
    );
    const [result] = await provider.fetchCampgroundModelInputs(
      [{ id: "camp", latitude: 49.25, longitude: -123.1 }],
      "2026-07-15",
    );
    const archiveRequest = new URL(String(fetchMock.mock.calls[0][0]));
    const forecastRequest = new URL(String(fetchMock.mock.calls[1][0]));

    expect(archiveRequest.hostname).toBe("archive-api.open-meteo.com");
    expect(archiveRequest.searchParams.get("start_date")).toBe("2026-05-16");
    expect(archiveRequest.searchParams.get("end_date")).toBe("2026-07-14");
    expect(archiveRequest.searchParams.get("hourly")).toBe(
      "snow_depth,soil_moisture_0_to_7cm",
    );
    expect(forecastRequest.searchParams.get("past_days")).toBeNull();
    expect(forecastRequest.searchParams.get("forecast_days")).toBe("16");
    expect(forecastRequest.searchParams.get("forecast_hours")).toBe("192");
    expect(forecastRequest.searchParams.get("hourly")).toContain(
      "wind_gusts_10m",
    );
    expect(result.history).toHaveLength(60);
    expect(result.v3Outlook).toHaveLength(8);
    expect(result.v3Outlook[0].hourly).toHaveLength(24);
  });
});
