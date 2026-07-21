import type { CampgroundMonthlyClimate } from "@/config/forecast";

type SeasonalPayload = {
  elevation?: number;
  monthly?: Record<string, Array<number | null> | string[]>;
};

function required(value: number | null | undefined, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Open-Meteo seasonal response did not return ${name}`);
  return value;
}

async function fetchSeasonalWithRetry(url: string) {
  const maximumAttempts = Math.max(
    1,
    Math.min(6, Number(process.env.FORECAST_OPEN_METEO_MAX_ATTEMPTS) || 6),
  );
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(60_000),
    });
    if (response.ok) return response;
    if (response.status !== 429 || attempt === maximumAttempts - 1) {
      const details = (await response.text()).slice(0, 500);
      throw new Error(
        `Open-Meteo seasonal API returned ${response.status}: ${details}`,
      );
    }
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : 60_000;
    console.warn(
      `Open-Meteo seasonal API returned 429; retrying attempt ${attempt + 2}/${maximumAttempts} in ${Math.round(delayMs / 1_000)} seconds.`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Open-Meteo seasonal retry budget was exhausted");
}

function monthSeasonality(targetMonth: string, latitude: number) {
  const [year, month] = targetMonth.split("-").map(Number);
  const middle = new Date(Date.UTC(year, month - 1, 15));
  const start = Date.UTC(year, 0, 0);
  const dayOfYear = Math.floor((middle.getTime() - start) / 86_400_000);
  const peak = latitude >= 0 ? 200 : 18;
  return Math.max(
    0,
    Math.min(
      1,
      0.5 + 0.5 * Math.cos(((dayOfYear - peak) * Math.PI * 2) / 365.25),
    ),
  );
}

export class OpenMeteoSeasonalProvider {
  readonly name = "open-meteo-ecmwf-seasonal";
  private readonly endpoint: string;

  constructor(
    baseUrl = "https://seasonal-api.open-meteo.com/v1/seasonal",
    private apiKey?: string,
  ) {
    const url = new URL(baseUrl);
    this.endpoint = url.toString().replace(/\/$/, "");
  }

  async fetchMonthlyOutlooks(
    campgrounds: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }>,
  ) {
    const params = new URLSearchParams({
      latitude: campgrounds.map((item) => item.latitude).join(","),
      longitude: campgrounds.map((item) => item.longitude).join(","),
      forecast_days: "210",
      timezone: "UTC",
    });
    for (const variable of [
      "temperature_2m_mean",
      "temperature_2m_anomaly",
      "precipitation_mean",
      "precipitation_anomaly",
    ])
      params.append("monthly", variable);
    if (this.apiKey) params.set("apikey", this.apiKey);
    const response = await fetchSeasonalWithRetry(`${this.endpoint}?${params}`);
    const json = (await response.json()) as SeasonalPayload | SeasonalPayload[];
    const payloads = Array.isArray(json) ? json : [json];
    if (payloads.length !== campgrounds.length)
      throw new Error(
        "Open-Meteo seasonal coordinate response count did not match the request",
      );
    return payloads.map((payload, campgroundIndex) => {
      const monthly = payload.monthly || {};
      const months = (monthly.time || []) as string[];
      const values = (key: string) =>
        (monthly[key] || []) as Array<number | null>;
      const outlook: CampgroundMonthlyClimate[] = months.map(
        (targetMonth, monthOffset) => ({
          targetMonth,
          monthOffset,
          seasonality: monthSeasonality(
            targetMonth,
            campgrounds[campgroundIndex].latitude,
          ),
          temperatureMeanC: required(
            values("temperature_2m_mean")[monthOffset],
            "temperature_2m_mean",
          ),
          temperatureAnomalyC: required(
            values("temperature_2m_anomaly")[monthOffset],
            "temperature_2m_anomaly",
          ),
          precipitationMm: required(
            values("precipitation_mean")[monthOffset],
            "precipitation_mean",
          ),
          precipitationAnomalyMm: required(
            values("precipitation_anomaly")[monthOffset],
            "precipitation_anomaly",
          ),
        }),
      );
      if (!outlook.length)
        throw new Error("Open-Meteo seasonal API returned no monthly periods");
      return {
        campgroundId: campgrounds[campgroundIndex].id,
        elevation: payload.elevation ?? null,
        outlook,
        raw: {
          ...payload,
          sourceModel: "ECMWF seasonal ensemble mean",
          resolutionKm: 36,
          biasCorrected: false,
        },
      };
    });
  }
}
