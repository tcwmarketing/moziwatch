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

class SeasonalHttpError extends Error {
  constructor(
    readonly status: number,
    readonly retryAfter: string | null,
  ) {
    super(`Open-Meteo seasonal API returned ${status}`);
  }
}

function retryAfterMs(header: string | null) {
  if (!header?.trim()) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds))
    return seconds >= 0 ? seconds * 1_000 : undefined;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

async function fetchSeasonalWithRetry(url: string) {
  const maximumAttempts = Math.max(
    1,
    Math.min(
      6,
      Math.trunc(Number(process.env.FORECAST_OPEN_METEO_MAX_ATTEMPTS)) || 6,
    ),
  );
  const retryBaseMs = Math.max(
    1,
    Math.min(
      60_000,
      Number(process.env.FORECAST_OPEN_METEO_RETRY_BASE_MS) || 5_000,
    ),
  );
  for (let attempt = 1; ; attempt++) {
    let reason: string;
    let delayMs: number;
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(60_000),
      });
      if (!response.ok) {
        await response.body?.cancel().catch(() => {});
        throw new SeasonalHttpError(
          response.status,
          response.headers.get("retry-after"),
        );
      }
      // Keep body reads inside the retry boundary: a socket can fail after headers arrive.
      return (await response.json()) as SeasonalPayload | SeasonalPayload[];
    } catch (error) {
      if (attempt >= maximumAttempts) throw error;
      const backoffMs = Math.min(60_000, retryBaseMs * 2 ** (attempt - 1));
      if (error instanceof SeasonalHttpError) {
        if (error.status !== 408 && error.status !== 429 && error.status < 500)
          throw error;
        reason = `HTTP ${error.status}`;
        delayMs =
          retryAfterMs(error.retryAfter) ??
          (error.status === 429 ? 60_000 : backoffMs);
        // Don't ignore a longer provider cooldown or hold up the runner indefinitely.
        if (delayMs > 120_000)
          throw new Error(
            `${error.message}; provider cooldown exceeds two minutes`,
            { cause: error },
          );
      } else if (
        error instanceof TypeError ||
        (error instanceof DOMException &&
          ["TimeoutError", "AbortError"].includes(error.name))
      ) {
        reason = error.name;
        delayMs = backoffMs;
      } else {
        throw error;
      }
    }
    console.warn(
      `Open-Meteo seasonal request failed (${reason}); retrying attempt ${attempt + 1}/${maximumAttempts} in ${Math.round(delayMs / 1_000)} seconds.`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
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
    baseUrl?: string,
    private apiKey?: string,
  ) {
    const url = new URL(
      baseUrl?.trim() || "https://seasonal-api.open-meteo.com/v1/seasonal",
    );
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
    const json = await fetchSeasonalWithRetry(`${this.endpoint}?${params}`);
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
