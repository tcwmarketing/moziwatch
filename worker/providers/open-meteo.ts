import type { CampgroundWeatherOutlook } from "@/config/forecast";
import type {
  CampgroundV3WeatherOutlook,
  V3HourlyWeather,
  V3WeatherHistoryDay,
} from "@/config/forecast-v3";
import type {
  CampgroundFiveDayWeather,
  CampgroundWeatherDay,
} from "@/config/weather";
import type { WeatherCell, WeatherProvider } from "./weather";

type ApiPayload = {
  latitude?: number;
  longitude?: number;
  elevation?: number;
  timezone?: string;
  timezone_abbreviation?: string;
  daily?: Record<string, Array<number | null> | string[]>;
  hourly?: Record<string, Array<number | null> | string[]>;
};

function mergeTimeSeries(
  history: Record<string, Array<number | null> | string[]> = {},
  forecast: Record<string, Array<number | null> | string[]> = {},
) {
  const historyTimes = (history.time || []) as string[];
  const forecastTimes = (forecast.time || []) as string[];
  const allTimes = [...new Set([...historyTimes, ...forecastTimes])].sort();
  const historyIndex = new Map(
    historyTimes.map((time, index) => [time, index]),
  );
  const forecastIndex = new Map(
    forecastTimes.map((time, index) => [time, index]),
  );
  const result: Record<string, Array<number | null> | string[]> = {
    time: allTimes,
  };
  const keys = new Set([...Object.keys(history), ...Object.keys(forecast)]);
  keys.delete("time");
  for (const key of keys) {
    const historyValues = history[key] || [];
    const forecastValues = forecast[key] || [];
    result[key] = allTimes.map((time) => {
      const currentForecastIndex = forecastIndex.get(time);
      if (currentForecastIndex !== undefined)
        return forecastValues[currentForecastIndex] ?? null;
      const currentHistoryIndex = historyIndex.get(time);
      return currentHistoryIndex === undefined
        ? null
        : (historyValues[currentHistoryIndex] ?? null);
    }) as Array<number | null>;
  }
  return result;
}

function mergePayloads(history: ApiPayload, forecast: ApiPayload): ApiPayload {
  return {
    ...history,
    ...forecast,
    daily: mergeTimeSeries(history.daily, forecast.daily),
    hourly: mergeTimeSeries(history.hourly, forecast.hourly),
  };
}

function finite(values: Array<number | null>) {
  return values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
}

function mean(values: Array<number | null>) {
  const valid = finite(values);
  return valid.length
    ? valid.reduce((sum, value) => sum + value, 0) / valid.length
    : null;
}

function sum(values: Array<number | null>) {
  return finite(values).reduce((total, value) => total + value, 0);
}

function required(value: number | null | undefined, name: string) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Open-Meteo did not return ${name}`);
  return value;
}

function clampValue(value: number) {
  return Math.max(0, Math.min(1, value));
}

function customerEndpoint(value: string, apiKey?: string) {
  const url = new URL(value);
  if (
    apiKey &&
    url.hostname.endsWith(".open-meteo.com") &&
    !url.hostname.startsWith("customer-")
  )
    url.hostname = `customer-${url.hostname}`;
  return url;
}

async function fetchWithRetry(url: string, timeoutMs: number) {
  const maximumAttempts = Math.max(
    1,
    Math.min(10, Number(process.env.FORECAST_OPEN_METEO_MAX_ATTEMPTS) || 10),
  );
  for (let attempt = 0; attempt < maximumAttempts; attempt++) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (response.ok) return response;
    const retryable = response.status === 429 || response.status >= 500;
    if (!retryable || attempt === maximumAttempts - 1)
      throw new Error(`Open-Meteo returned ${response.status}`);
    const retryAfter = Number(response.headers.get("retry-after"));
    const delayMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1_000
        : response.status === 429
          ? Math.min(600_000, 60_000 * 2 ** attempt)
          : Math.min(60_000, 5_000 * 2 ** attempt);
    console.warn(
      `Open-Meteo returned ${response.status}; retrying attempt ${attempt + 2}/${maximumAttempts} in ${Math.round(delayMs / 1_000)} seconds.`,
    );
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error("Open-Meteo retry budget was exhausted");
}

function dayOfYear(date: string) {
  const current = Date.parse(`${date}T00:00:00Z`);
  const year = Number(date.slice(0, 4));
  return Math.floor((current - Date.UTC(year, 0, 0)) / 86_400_000);
}

function seasonality(date: string, latitude: number) {
  const peak = latitude >= 0 ? 200 : 18;
  return Math.max(
    0,
    Math.min(
      1,
      0.5 + 0.5 * Math.cos(((dayOfYear(date) - peak) * Math.PI * 2) / 365.25),
    ),
  );
}

export class OpenMeteoProvider implements WeatherProvider {
  readonly name: string;
  private readonly endpoint: string;
  private readonly archiveEndpoint: string;
  private readonly sourceModel: string;

  constructor(
    baseUrl: string,
    private apiKey?: string,
    archiveUrl = process.env.OPEN_METEO_ARCHIVE_URL ||
      "https://archive-api.open-meteo.com/v1/archive",
  ) {
    const url = customerEndpoint(baseUrl, apiKey);
    const path = url.pathname.replace(/\/$/, "");
    // The free Open-Meteo API exposes the variables used by both the public
    // weather cards and the mosquito model at /v1/forecast. Preserve a fully
    // qualified commercial/self-hosted endpoint, but make the documented
    // /v1 base URL resolve to the general forecast endpoint (not /v1/ecmwf,
    // which does not support every variable requested here).
    url.pathname = /\/(?:ecmwf|forecast)$/.test(path)
      ? path
      : `${path}/forecast`;
    this.endpoint = url.toString().replace(/\/$/, "");
    this.archiveEndpoint = customerEndpoint(archiveUrl, apiKey)
      .toString()
      .replace(/\/$/, "");
    const usesEcmwfEndpoint = url.pathname.endsWith("/ecmwf");
    this.name = usesEcmwfEndpoint ? "open-meteo-ecmwf" : "open-meteo-forecast";
    this.sourceModel = usesEcmwfEndpoint
      ? "ECMWF IFS"
      : "Open-Meteo Forecast API";
  }

  private async request(
    points: Array<{ latitude: number; longitude: number }>,
    outlook: boolean,
  ) {
    const params = new URLSearchParams({
      latitude: points.map((point) => point.latitude).join(","),
      longitude: points.map((point) => point.longitude).join(","),
      daily: [
        "temperature_2m_mean",
        "temperature_2m_min",
        "relative_humidity_2m_mean",
        "dew_point_2m_mean",
        "precipitation_sum",
        "wind_speed_10m_mean",
      ].join(","),
      hourly: outlook
        ? [
            "soil_moisture_0_to_7cm",
            "precipitation",
            "relative_humidity_2m",
            "dew_point_2m",
            "temperature_2m",
            "wind_speed_10m",
          ].join(",")
        : "soil_moisture_0_to_7cm",
      past_days: outlook ? "14" : "7",
      // Fifteen days lets a weekly campground refresh still serve tonight
      // plus seven future nights until its next scheduled run.
      forecast_days: outlook ? "15" : "1",
      timezone: "UTC",
      cell_selection: "land",
    });
    if (this.apiKey) params.set("apikey", this.apiKey);
    const response = await fetchWithRetry(`${this.endpoint}?${params}`, 45_000);
    const json = (await response.json()) as ApiPayload | ApiPayload[];
    const payloads = Array.isArray(json) ? json : [json];
    if (payloads.length !== points.length)
      throw new Error(
        "Open-Meteo coordinate response count did not match the request",
      );
    return payloads;
  }

  async fetchFiveDayWeather(point: {
    latitude: number;
    longitude: number;
  }): Promise<CampgroundFiveDayWeather> {
    const params = new URLSearchParams({
      latitude: String(point.latitude),
      longitude: String(point.longitude),
      daily: [
        "weather_code",
        "temperature_2m_max",
        "temperature_2m_min",
        "precipitation_sum",
        "wind_speed_10m_max",
      ].join(","),
      forecast_days: "5",
      timezone: "auto",
      cell_selection: "land",
    });
    if (this.apiKey) params.set("apikey", this.apiKey);
    const response = await fetchWithRetry(`${this.endpoint}?${params}`, 12_000);
    const payload = (await response.json()) as ApiPayload;
    const daily = payload.daily || {};
    const dates = (daily.time || []) as string[];
    const values = (key: string) => (daily[key] || []) as Array<number | null>;
    if (dates.length < 5)
      throw new Error("Open-Meteo returned fewer than five weather days");
    const days: CampgroundWeatherDay[] = dates
      .slice(0, 5)
      .map((date, index) => ({
        date,
        weatherCode: required(values("weather_code")[index], "weather_code"),
        temperatureMaxC: required(
          values("temperature_2m_max")[index],
          "temperature_2m_max",
        ),
        temperatureMinC: required(
          values("temperature_2m_min")[index],
          "temperature_2m_min",
        ),
        precipitationMm: required(
          values("precipitation_sum")[index],
          "precipitation_sum",
        ),
        windSpeedMaxKmh: required(
          values("wind_speed_10m_max")[index],
          "wind_speed_10m_max",
        ),
      }));
    return {
      timezone: payload.timezone || "UTC",
      timezoneAbbreviation: payload.timezone_abbreviation || "UTC",
      days,
    };
  }

  async fetchCurrentDay(
    cells: Array<{ key: string; latitude: number; longitude: number }>,
    date: string,
  ) {
    const payloads = await this.request(cells, false);
    return payloads.map((payload, index): WeatherCell => {
      const daily = payload.daily || {};
      const precipitation = (daily.precipitation_sum || []) as Array<
        number | null
      >;
      const last = Math.max(0, precipitation.length - 1);
      const soil = (payload.hourly?.soil_moisture_0_to_7cm || []) as Array<
        number | null
      >;
      return {
        key: cells[index].key,
        latitude: cells[index].latitude,
        longitude: cells[index].longitude,
        elevation: payload.elevation ?? null,
        variables: {
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
          precipitation_7d: sum(
            precipitation.slice(Math.max(0, last - 7), last),
          ),
          wind_speed_10m_mean:
            ((daily.wind_speed_10m_mean || []) as Array<number | null>)[last] ??
            null,
          soil_moisture_0_to_7cm_mean: mean(soil.slice(-24)),
        },
        raw: { ...payload, requestedDate: date, sourceModel: this.sourceModel },
      };
    });
  }

  async fetchCampgroundModelInputs(
    campgrounds: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }>,
    date: string,
  ) {
    const forecastParams = new URLSearchParams({
      latitude: campgrounds.map((item) => item.latitude).join(","),
      longitude: campgrounds.map((item) => item.longitude).join(","),
      daily: [
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
        "sunrise",
        "sunset",
      ].join(","),
      hourly: [
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
      ].join(","),
      // One extra day covers UTC/local-date rollover in western time zones.
      forecast_days: "16",
      forecast_hours: "192",
      timezone: "auto",
      cell_selection: "land",
    });
    const historyEnd = new Date(`${date}T00:00:00Z`);
    historyEnd.setUTCDate(historyEnd.getUTCDate() - 1);
    const historyStart = new Date(historyEnd);
    historyStart.setUTCDate(historyStart.getUTCDate() - 59);
    const archiveParams = new URLSearchParams({
      latitude: campgrounds.map((item) => item.latitude).join(","),
      longitude: campgrounds.map((item) => item.longitude).join(","),
      start_date: historyStart.toISOString().slice(0, 10),
      end_date: historyEnd.toISOString().slice(0, 10),
      daily: [
        "temperature_2m_mean",
        "temperature_2m_min",
        "temperature_2m_max",
        "precipitation_sum",
        "rain_sum",
        "snowfall_sum",
        "et0_fao_evapotranspiration",
      ].join(","),
      hourly: ["snow_depth", "soil_moisture_0_to_7cm"].join(","),
      timezone: "auto",
      cell_selection: "land",
    });
    if (this.apiKey) {
      forecastParams.set("apikey", this.apiKey);
      archiveParams.set("apikey", this.apiKey);
    }
    const [archiveResponse, forecastResponse] = await Promise.all([
      fetchWithRetry(`${this.archiveEndpoint}?${archiveParams}`, 60_000),
      fetchWithRetry(`${this.endpoint}?${forecastParams}`, 60_000),
    ]);
    const archiveJson = (await archiveResponse.json()) as
      ApiPayload | ApiPayload[];
    const forecastJson = (await forecastResponse.json()) as
      ApiPayload | ApiPayload[];
    const archivePayloads = Array.isArray(archiveJson)
      ? archiveJson
      : [archiveJson];
    const forecastPayloads = Array.isArray(forecastJson)
      ? forecastJson
      : [forecastJson];
    const payloads = forecastPayloads.map((payload, index) =>
      mergePayloads(archivePayloads[index] || {}, payload),
    );
    if (payloads.length !== campgrounds.length)
      throw new Error(
        "Open-Meteo coordinate response count did not match the request",
      );
    if (archivePayloads.length !== campgrounds.length)
      throw new Error(
        "Open-Meteo archive coordinate response count did not match the request",
      );
    const weatherRunAt = new Date().toISOString();
    return payloads.map((payload, campgroundIndex) => {
      const daily = payload.daily || {};
      const dates = (daily.time || []) as string[];
      const start = dates.indexOf(date);
      if (start < 0)
        throw new Error(`Open-Meteo response did not include ${date}`);
      const dailyValues = (key: string) =>
        (daily[key] || []) as Array<number | null>;
      const hourly = payload.hourly || {};
      const hourlyTimes = (hourly.time || []) as string[];
      const hourlyValues = (key: string) =>
        (hourly[key] || []) as Array<number | null>;
      const valuesForDate = (key: string, target: string) => {
        const values = hourlyValues(key);
        return hourlyTimes.flatMap((time, index) =>
          time.startsWith(target) ? [values[index] ?? null] : [],
        );
      };
      let available = 0;
      let expected = 0;
      const value = (
        source: Array<number | null>,
        index: number,
        fallback = 0,
      ) => {
        expected++;
        const current = source[index];
        if (typeof current === "number" && Number.isFinite(current)) {
          available++;
          return current;
        }
        return fallback;
      };
      const dailyHistory: V3WeatherHistoryDay[] = dates
        .slice(Math.max(0, start - 60), start + 15)
        .map((targetDate, relativeIndex) => {
          const index = Math.max(0, start - 60) + relativeIndex;
          return {
            date: targetDate,
            temperatureMeanC: value(dailyValues("temperature_2m_mean"), index),
            temperatureMinC: value(dailyValues("temperature_2m_min"), index),
            temperatureMaxC: value(dailyValues("temperature_2m_max"), index),
            precipitationMm: value(dailyValues("precipitation_sum"), index),
            rainMm: value(dailyValues("rain_sum"), index),
            snowfallCm: value(dailyValues("snowfall_sum"), index),
            snowDepthM: mean(valuesForDate("snow_depth", targetDate)) ?? 0,
            soilMoisture:
              mean(valuesForDate("soil_moisture_0_to_7cm", targetDate)) ?? 0,
            evapotranspirationMm: value(
              dailyValues("et0_fao_evapotranspiration"),
              index,
            ),
          };
        });
      const historyStart = Math.max(0, start - 60);
      const dayHistory = (dayIndex: number) =>
        dailyHistory.slice(0, dayIndex - historyStart);
      const v2Outlook: CampgroundWeatherOutlook[] = [];
      const v3Outlook: CampgroundV3WeatherOutlook[] = [];
      for (let dayOffset = 0; dayOffset < 15; dayOffset++) {
        const index = start + dayOffset;
        const targetDate = dates[index];
        if (!targetDate)
          throw new Error("Open-Meteo returned fewer than 15 days");
        const precipitation = dailyValues("precipitation_sum");
        const eveningPrecipitation = valuesForDate(
          "precipitation",
          targetDate,
        ).slice(18, 24);
        const eveningHumidity = mean(
          valuesForDate("relative_humidity_2m", targetDate).slice(18, 24),
        );
        v2Outlook.push({
          targetDate,
          dayOffset,
          temperatureMeanC: value(dailyValues("temperature_2m_mean"), index),
          overnightLowC: value(dailyValues("temperature_2m_min"), index),
          relativeHumidityMean: value(
            dailyValues("relative_humidity_2m_mean"),
            index,
          ),
          dewPointMeanC: value(dailyValues("dew_point_2m_mean"), index),
          precipitationMm: value(precipitation, index),
          precipitation24hMm: sum(precipitation.slice(index - 1, index)),
          precipitation3dMm: sum(precipitation.slice(index - 3, index)),
          precipitation7dMm: sum(precipitation.slice(index - 7, index)),
          precipitation14dMm: sum(precipitation.slice(index - 14, index)),
          soilMoisture:
            mean(valuesForDate("soil_moisture_0_to_7cm", targetDate)) ?? 0,
          windSpeedKmh: value(dailyValues("wind_speed_10m_mean"), index),
          activePrecipitationMm: sum(eveningPrecipitation),
          seasonality: seasonality(
            targetDate,
            campgrounds[campgroundIndex].latitude,
          ),
          eveningActivity: clampValue(((eveningHumidity ?? 50) - 35) / 55),
        });
        if (dayOffset < 8) {
          const hourlyForDay: V3HourlyWeather[] = hourlyTimes.flatMap(
            (time, hourIndex) =>
              time.startsWith(targetDate)
                ? [
                    {
                      time,
                      temperatureC: value(
                        hourlyValues("temperature_2m"),
                        hourIndex,
                      ),
                      relativeHumidity: value(
                        hourlyValues("relative_humidity_2m"),
                        hourIndex,
                      ),
                      precipitationMm: value(
                        hourlyValues("precipitation"),
                        hourIndex,
                      ),
                      rainMm: value(hourlyValues("rain"), hourIndex),
                      snowfallCm: value(hourlyValues("snowfall"), hourIndex),
                      snowDepthM: value(hourlyValues("snow_depth"), hourIndex),
                      windSpeedKmh: value(
                        hourlyValues("wind_speed_10m"),
                        hourIndex,
                      ),
                      windGustKmh: value(
                        hourlyValues("wind_gusts_10m"),
                        hourIndex,
                      ),
                      isDay: value(hourlyValues("is_day"), hourIndex) === 1,
                    },
                  ]
                : [],
          );
          v3Outlook.push({
            targetDate,
            dayOffset,
            history: dayHistory(index),
            hourly: hourlyForDay,
            sunrise:
              ((daily.sunrise || []) as string[])[index] ||
              `${targetDate}T06:00`,
            sunset:
              ((daily.sunset || []) as string[])[index] ||
              `${targetDate}T18:00`,
            weatherRunAt,
            completeness: expected ? available / expected : 0,
          });
        }
      }
      return {
        campgroundId: campgrounds[campgroundIndex].id,
        outlook: v2Outlook,
        v3Outlook,
        history: dailyHistory.slice(0, start - historyStart),
        elevation: payload.elevation ?? null,
        raw: {
          ...payload,
          requestedDate: date,
          sourceModel: `${this.sourceModel} + Open-Meteo Historical Weather API`,
        },
      };
    });
  }

  async fetchCampgroundOutlook(
    campgrounds: Array<{
      id: string;
      latitude: number;
      longitude: number;
    }>,
    date: string,
  ) {
    const payloads = await this.request(campgrounds, true);
    return payloads.map((payload, campgroundIndex) => {
      const daily = payload.daily || {};
      const dates = (daily.time || []) as string[];
      const start = dates.indexOf(date);
      if (start < 0)
        throw new Error(`Open-Meteo response did not include ${date}`);
      const values = (key: string) =>
        (daily[key] || []) as Array<number | null>;
      const precipitation = values("precipitation_sum");
      const hourly = payload.hourly || {};
      const hourlyTimes = (hourly.time || []) as string[];
      const hourlyValues = (key: string) =>
        (hourly[key] || []) as Array<number | null>;
      const hoursForDate = (key: string, target: string) => {
        const series = hourlyValues(key);
        return hourlyTimes.flatMap((time, index) =>
          time.startsWith(target) ? [series[index] ?? null] : [],
        );
      };
      const outlook: CampgroundWeatherOutlook[] = [];
      for (let dayOffset = 0; dayOffset < 15; dayOffset++) {
        const index = start + dayOffset;
        const targetDate = dates[index];
        if (!targetDate)
          throw new Error("Open-Meteo returned fewer than 15 days");
        const eveningPrecipitation = hoursForDate(
          "precipitation",
          targetDate,
        ).slice(18, 24);
        const eveningHumidity = mean(
          hoursForDate("relative_humidity_2m", targetDate).slice(18, 24),
        );
        outlook.push({
          targetDate,
          dayOffset,
          temperatureMeanC: required(
            values("temperature_2m_mean")[index],
            "temperature_2m_mean",
          ),
          overnightLowC: required(
            values("temperature_2m_min")[index],
            "temperature_2m_min",
          ),
          relativeHumidityMean: required(
            values("relative_humidity_2m_mean")[index],
            "relative_humidity_2m_mean",
          ),
          dewPointMeanC: required(
            values("dew_point_2m_mean")[index],
            "dew_point_2m_mean",
          ),
          precipitationMm: required(precipitation[index], "precipitation_sum"),
          precipitation24hMm: sum(precipitation.slice(index - 1, index)),
          precipitation3dMm: sum(
            precipitation.slice(Math.max(0, index - 3), index),
          ),
          precipitation7dMm: sum(
            precipitation.slice(Math.max(0, index - 7), index),
          ),
          precipitation14dMm: sum(
            precipitation.slice(Math.max(0, index - 14), index),
          ),
          soilMoisture: required(
            mean(hoursForDate("soil_moisture_0_to_7cm", targetDate)),
            "soil_moisture_0_to_7cm",
          ),
          windSpeedKmh: required(
            values("wind_speed_10m_mean")[index],
            "wind_speed_10m_mean",
          ),
          activePrecipitationMm: sum(eveningPrecipitation),
          seasonality: seasonality(
            targetDate,
            campgrounds[campgroundIndex].latitude,
          ),
          eveningActivity: Math.max(
            0,
            Math.min(1, ((eveningHumidity ?? 50) - 35) / 55),
          ),
        });
      }
      return {
        campgroundId: campgrounds[campgroundIndex].id,
        outlook,
        elevation: payload.elevation ?? null,
        raw: {
          ...payload,
          requestedDate: date,
          sourceModel: this.sourceModel,
        },
      };
    });
  }
}
