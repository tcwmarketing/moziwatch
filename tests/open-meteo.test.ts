import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenMeteoProvider } from "@/worker/providers/open-meteo";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenMeteoProvider", () => {
  it("uses the ECMWF endpoint and calculates the current shallow-soil mean", async () => {
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
    expect(requestedUrl.pathname).toBe("/v1/ecmwf");
    expect(requestedUrl.searchParams.get("hourly")).toBe(
      "soil_moisture_0_to_7cm",
    );
    expect(result.variables.soil_moisture_0_to_7cm_mean).toBeCloseTo(0.3);
    expect(result.variables.precipitation_7d).toBe(4);
    expect(result.raw.sourceModel).toBe("ECMWF IFS");
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
});
