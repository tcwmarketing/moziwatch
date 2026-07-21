"use client";

import { useEffect, useState } from "react";
import type { CampgroundFiveDayWeather } from "@/config/weather";
import { weatherCodePresentation } from "@/config/weather";

type Payload = {
  forecast: CampgroundFiveDayWeather;
  fetchedAt: string;
};

function dayLabel(date: string, index: number) {
  if (index === 0) return "Today";
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
  });
}

export function CampgroundWeatherForecast({
  campgroundId,
}: {
  campgroundId: string;
}) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const load = async (attempt = 0) => {
      try {
        const response = await fetch(
          `/api/campgrounds/${campgroundId}/weather`,
        );
        if (response.status === 202 && attempt < 4) {
          const body = (await response.json()) as {
            retryAfterSeconds?: number;
          };
          retryTimer = setTimeout(
            () => void load(attempt + 1),
            Math.max(1, body.retryAfterSeconds || 2) * 1_000,
          );
          return;
        }
        if (!response.ok) throw new Error("Weather request failed");
        const body = (await response.json()) as Payload;
        if (!cancelled) setPayload(body);
      } catch {
        if (!cancelled) setError(true);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [campgroundId]);

  return (
    <section className="content-card campground-weather" aria-live="polite">
      <div className="campground-weather-heading">
        <p className="eyebrow">Local weather</p>
        <h2>Five-day weather forecast</h2>
      </div>
      {payload ? (
        <>
          <div className="campground-weather-days">
            {payload.forecast.days.map((day, index) => {
              const condition = weatherCodePresentation(day.weatherCode);
              return (
                <article key={day.date}>
                  <strong>{dayLabel(day.date, index)}</strong>
                  <span
                    className="weather-symbol"
                    role="img"
                    aria-label={condition.label}
                  >
                    {condition.symbol}
                  </span>
                  <b
                    aria-label={`High ${Math.round(day.temperatureMaxC)} degrees, low ${Math.round(day.temperatureMinC)} degrees Celsius`}
                  >
                    {Math.round(day.temperatureMaxC)}
                    {"\u00b0"} / {Math.round(day.temperatureMinC)}
                    {"\u00b0"}
                  </b>
                  <small>Rain {day.precipitationMm.toFixed(1)} mm</small>
                  <small>Wind {Math.round(day.windSpeedMaxKmh)} km/h</small>
                </article>
              );
            })}
          </div>
          <small className="campground-weather-source">
            Updated {new Date(payload.fetchedAt).toLocaleString()}
          </small>
        </>
      ) : error ? (
        <p className="empty-state">
          The weather forecast is temporarily unavailable. Please try again
          later.
        </p>
      ) : (
        <div className="campground-weather-loading" role="status">
          Loading the latest forecast...
        </div>
      )}
    </section>
  );
}
