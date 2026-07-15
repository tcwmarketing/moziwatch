import type { WeatherCell, WeatherProvider } from "./weather";

type ApiPayload = {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  daily?: Record<string, Array<number | null> | string[]>;
  hourly?: Record<string, Array<number | null> | string[]>;
};

function mean(values: Array<number | null>) {
  const valid = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

export class OpenMeteoProvider implements WeatherProvider {
  readonly name = "open-meteo-ecmwf";
  private readonly endpoint: string;

  constructor(
    baseUrl: string,
    private apiKey?: string,
  ) {
    const url = new URL(baseUrl);
    const path = url.pathname.replace(/\/$/, "");
    // The generic forecast endpoint can select regional models that expose the
    // requested soil-moisture field as an all-null series. The documented
    // ECMWF endpoint provides a consistent global 0-7 cm soil layer.
    url.pathname = /\/(?:ecmwf|forecast)$/.test(path) ? path : `${path}/ecmwf`;
    this.endpoint = url.toString().replace(/\/$/, "");
  }

  async fetchCurrentDay(
    cells: Array<{ key: string; latitude: number; longitude: number }>,
    date: string,
  ) {
    const params = new URLSearchParams({
      latitude: cells.map((cell) => cell.latitude).join(","),
      longitude: cells.map((cell) => cell.longitude).join(","),
      daily: [
        "temperature_2m_mean",
        "relative_humidity_2m_mean",
        "dew_point_2m_mean",
        "precipitation_sum",
        "wind_speed_10m_mean",
      ].join(","),
      hourly: "soil_moisture_0_to_7cm",
      past_days: "7",
      forecast_days: "1",
      timezone: "UTC",
      cell_selection: "land",
    });
    if (this.apiKey) params.set("apikey", this.apiKey);
    const response = await fetch(`${this.endpoint}?${params}`, {
      signal: AbortSignal.timeout(45_000),
    });
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`);
    const json = (await response.json()) as ApiPayload | ApiPayload[];
    const payloads = Array.isArray(json) ? json : [json];
    if (payloads.length !== cells.length)
      throw new Error(
        "Open-Meteo coordinate response count did not match the request",
      );
    return payloads.map((payload, index): WeatherCell => {
      const daily = payload.daily || {};
      const precipitation = (daily.precipitation_sum || []) as Array<
        number | null
      >;
      const last = Math.max(0, precipitation.length - 1);
      const soil = (payload.hourly?.soil_moisture_0_to_7cm || []) as Array<
        number | null
      >;
      const variables = {
        temperature_2m_mean:
          ((daily.temperature_2m_mean || []) as Array<number | null>)[last] ??
          null,
        relative_humidity_2m_mean:
          ((daily.relative_humidity_2m_mean || []) as Array<number | null>)[
            last
          ] ?? null,
        dew_point_2m_mean:
          ((daily.dew_point_2m_mean || []) as Array<number | null>)[last] ??
          null,
        precipitation_sum: precipitation[last] ?? null,
        precipitation_7d: precipitation
          .slice(Math.max(0, last - 7), last)
          .filter((value): value is number => typeof value === "number")
          .reduce((sum, value) => sum + value, 0),
        wind_speed_10m_mean:
          ((daily.wind_speed_10m_mean || []) as Array<number | null>)[last] ??
          null,
        soil_moisture_0_to_7cm_mean: mean(soil.slice(-24)),
      };
      return {
        key: cells[index].key,
        latitude: cells[index].latitude,
        longitude: cells[index].longitude,
        elevation: payload.elevation ?? null,
        variables,
        raw: {
          ...payload,
          requestedDate: date,
          sourceModel: "ECMWF IFS",
        },
      };
    });
  }
}
