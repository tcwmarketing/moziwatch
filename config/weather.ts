export type CampgroundWeatherDay = {
  date: string;
  weatherCode: number;
  temperatureMaxC: number;
  temperatureMinC: number;
  precipitationMm: number;
  windSpeedMaxKmh: number;
};

export type CampgroundFiveDayWeather = {
  timezone: string;
  timezoneAbbreviation: string;
  days: CampgroundWeatherDay[];
};

// Detail-page weather is intentionally visitor-triggered. A campground's
// cached forecast is reused for this long before another Open-Meteo request is
// allowed, which keeps quiet campgrounds from generating any weather traffic.
export const CAMPGROUND_WEATHER_CACHE_HOURS = 12;

export function weatherCodePresentation(code: number) {
  if (code === 0) return { label: "Clear", symbol: "☀️" };
  if (code <= 2) return { label: "Mostly clear", symbol: "🌤️" };
  if (code === 3) return { label: "Cloudy", symbol: "☁️" };
  if (code === 45 || code === 48) return { label: "Fog", symbol: "🌫️" };
  if (code >= 51 && code <= 57) return { label: "Drizzle", symbol: "🌦️" };
  if (code >= 61 && code <= 67) return { label: "Rain", symbol: "🌧️" };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return { label: "Snow", symbol: "🌨️" };
  if (code >= 80 && code <= 82) return { label: "Rain showers", symbol: "🌦️" };
  if (code >= 95) return { label: "Thunderstorms", symbol: "⛈️" };
  return { label: "Mixed conditions", symbol: "🌥️" };
}
