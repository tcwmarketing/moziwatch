import { NextResponse } from "next/server";
import {
  CAMPGROUND_WEATHER_CACHE_HOURS,
  type CampgroundFiveDayWeather,
} from "@/config/weather";
import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";
import { toPostgresJson } from "@/lib/postgres-json";
import { OpenMeteoProvider } from "@/worker/providers/open-meteo";

export const dynamic = "force-dynamic";

type CacheRow = {
  forecast: CampgroundFiveDayWeather | null;
  provider: string | null;
  fetched_at: DatabaseDate | null;
  fresh: boolean;
  refreshing: boolean;
  backed_off: boolean;
};

const CACHE_HEADERS = {
  "Cache-Control":
    "public, max-age=300, s-maxage=900, stale-while-revalidate=1800",
};

async function readCache(campgroundId: string) {
  const rows = await sqlClient<CacheRow[]>`
    SELECT forecast, provider, fetched_at,
      coalesce(expires_at > now(), false) AS fresh,
      coalesce(refresh_started_at > now() - interval '2 minutes', false) AS refreshing,
      coalesce(last_error_at > now() - interval '2 minutes', false) AS backed_off
    FROM campground_weather_cache
    WHERE campground_id = ${campgroundId}::uuid
  `;
  return rows[0] || null;
}

function weatherResponse(cache: CacheRow, stale = false) {
  return NextResponse.json(
    {
      forecast: cache.forecast,
      provider: cache.provider,
      fetchedAt: cache.fetched_at
        ? parseDatabaseDate(cache.fetched_at).toISOString()
        : null,
      stale,
    },
    { headers: CACHE_HEADERS },
  );
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return NextResponse.json({ error: "Invalid campground." }, { status: 400 });

  const campgrounds = await sqlClient<
    Array<{ id: string; latitude: number; longitude: number }>
  >`
    SELECT id, latitude, longitude FROM campgrounds
    WHERE id = ${id}::uuid AND active = true AND operational_status <> 'closed'
    LIMIT 1
  `;
  const campground = campgrounds[0];
  if (!campground)
    return NextResponse.json(
      { error: "Campground not found." },
      { status: 404 },
    );

  await sqlClient`
    INSERT INTO campground_weather_cache (campground_id)
    VALUES (${id}::uuid)
    ON CONFLICT (campground_id) DO NOTHING
  `;
  let cache = await readCache(id);
  if (cache?.fresh && cache.forecast) return weatherResponse(cache);

  const claims = await sqlClient<{ claimed: boolean }[]>`
    UPDATE campground_weather_cache SET
      refresh_started_at = now(), updated_at = now()
    WHERE campground_id = ${id}::uuid
      AND (forecast IS NULL OR expires_at IS NULL OR expires_at <= now())
      AND (refresh_started_at IS NULL OR refresh_started_at <= now() - interval '2 minutes')
      AND (last_error_at IS NULL OR last_error_at <= now() - interval '2 minutes')
    RETURNING true AS claimed
  `;
  if (!claims[0]?.claimed) {
    cache = await readCache(id);
    if (cache?.forecast) return weatherResponse(cache, true);
    if (cache?.refreshing)
      return NextResponse.json(
        { pending: true, retryAfterSeconds: 2 },
        {
          status: 202,
          headers: { "Retry-After": "2", "Cache-Control": "no-store" },
        },
      );
    return NextResponse.json(
      { error: "Weather is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const provider = new OpenMeteoProvider(
    process.env.OPEN_METEO_BASE_URL || "https://api.open-meteo.com/v1/forecast",
    process.env.OPEN_METEO_API_KEY,
  );
  try {
    const forecast = await provider.fetchFiveDayWeather(campground);
    const rows = await sqlClient<CacheRow[]>`
      UPDATE campground_weather_cache SET
        provider = ${provider.name},
        forecast = ${toPostgresJson(forecast)}::jsonb,
        fetched_at = now(),
        expires_at = now() + (${CAMPGROUND_WEATHER_CACHE_HOURS} * interval '1 hour'),
        refresh_started_at = NULL, last_error_at = NULL, last_error = NULL,
        updated_at = now()
      WHERE campground_id = ${id}::uuid
      RETURNING forecast, provider, fetched_at, true AS fresh,
        false AS refreshing, false AS backed_off
    `;
    return weatherResponse(rows[0]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sqlClient`
      UPDATE campground_weather_cache SET
        refresh_started_at = NULL, last_error_at = now(),
        last_error = ${message.slice(0, 500)}, updated_at = now()
      WHERE campground_id = ${id}::uuid
    `;
    console.error("On-demand campground weather refresh failed", {
      campgroundId: id,
      error: message,
    });
    cache = await readCache(id);
    if (cache?.forecast) return weatherResponse(cache, true);
    return NextResponse.json(
      { error: "Weather is temporarily unavailable." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
