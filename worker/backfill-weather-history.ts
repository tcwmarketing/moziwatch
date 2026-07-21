import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";

type Payload = {
  daily?: Record<string, Array<string | number | null>>;
  hourly?: Record<string, Array<string | number | null>>;
};

function isoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function average(values: Array<number | null>) {
  const finite = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );
  return finite.length
    ? finite.reduce((sum, value) => sum + value, 0) / finite.length
    : 0;
}

const end = process.env.WEATHER_HISTORY_END
  ? new Date(`${process.env.WEATHER_HISTORY_END}T00:00:00Z`)
  : new Date(Date.now() - 86_400_000);
const start = process.env.WEATHER_HISTORY_START
  ? new Date(`${process.env.WEATHER_HISTORY_START}T00:00:00Z`)
  : new Date(end.getTime() - 59 * 86_400_000);
const endpoint =
  process.env.OPEN_METEO_ARCHIVE_URL ||
  "https://archive-api.open-meteo.com/v1/archive";
const provider = "open-meteo-archive";

try {
  const campgrounds = await sqlClient<
    Array<{ id: string; latitude: number; longitude: number }>
  >`
    SELECT c.id, c.latitude, c.longitude FROM campgrounds c
    JOIN campground_habitat_profiles hp
      ON hp.campground_id = c.id AND hp.active = true
    WHERE c.active = true ORDER BY c.id
  `;
  let stored = 0;
  for (let offset = 0; offset < campgrounds.length; offset += 10) {
    const batch = campgrounds.slice(offset, offset + 10);
    const params = new URLSearchParams({
      latitude: batch.map((item) => item.latitude).join(","),
      longitude: batch.map((item) => item.longitude).join(","),
      start_date: isoDate(start),
      end_date: isoDate(end),
      daily: [
        "temperature_2m_mean",
        "temperature_2m_min",
        "temperature_2m_max",
        "precipitation_sum",
        "rain_sum",
        "snowfall_sum",
        "et0_fao_evapotranspiration",
      ].join(","),
      hourly: "soil_moisture_0_to_7cm,snow_depth",
      timezone: "auto",
      cell_selection: "land",
    });
    const response = await fetch(`${endpoint}?${params}`, {
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`Open-Meteo archive returned ${response.status}`);
    const json = (await response.json()) as Payload | Payload[];
    const payloads = Array.isArray(json) ? json : [json];
    if (payloads.length !== batch.length)
      throw new Error("Open-Meteo archive response count changed");
    await sqlClient.begin(async (tx) => {
      for (let index = 0; index < batch.length; index++) {
        const daily = payloads[index].daily || {};
        const hourly = payloads[index].hourly || {};
        const dates = (daily.time || []) as string[];
        const dailyNumbers = (key: string) =>
          (daily[key] || []) as Array<number | null>;
        const hourlyTimes = (hourly.time || []) as string[];
        const hourlyNumbers = (key: string, date: string) => {
          const values = (hourly[key] || []) as Array<number | null>;
          return hourlyTimes.flatMap((time, hourIndex) =>
            time.startsWith(date) ? [values[hourIndex] ?? null] : [],
          );
        };
        for (let dayIndex = 0; dayIndex < dates.length; dayIndex++) {
          const date = dates[dayIndex];
          const variables = {
            date,
            temperatureMeanC:
              dailyNumbers("temperature_2m_mean")[dayIndex] ?? 0,
            temperatureMinC: dailyNumbers("temperature_2m_min")[dayIndex] ?? 0,
            temperatureMaxC: dailyNumbers("temperature_2m_max")[dayIndex] ?? 0,
            precipitationMm: dailyNumbers("precipitation_sum")[dayIndex] ?? 0,
            rainMm: dailyNumbers("rain_sum")[dayIndex] ?? 0,
            snowfallCm: dailyNumbers("snowfall_sum")[dayIndex] ?? 0,
            snowDepthM: average(hourlyNumbers("snow_depth", date)),
            soilMoisture: average(
              hourlyNumbers("soil_moisture_0_to_7cm", date),
            ),
            evapotranspirationMm:
              dailyNumbers("et0_fao_evapotranspiration")[dayIndex] ?? 0,
          };
          await tx`
            INSERT INTO campground_weather_history_daily (
              campground_id, observed_on, provider, weather_run_at, variables
            ) VALUES (
              ${batch[index].id}::uuid, ${date}::date, ${provider}, now(),
              ${toPostgresJson(variables)}::jsonb
            )
            ON CONFLICT (campground_id, observed_on, provider) DO UPDATE SET
              weather_run_at = excluded.weather_run_at,
              variables = excluded.variables, updated_at = now()
          `;
          stored++;
        }
      }
    });
  }
  console.log(
    `Stored ${stored} historical weather days for ${campgrounds.length} campgrounds`,
  );
} finally {
  await sqlClient.end();
}
