import { NextResponse } from "next/server";
import { sqlClient } from "@/db";

type GeocodingResult = {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country_code?: string;
  country?: string;
  admin1?: string;
  population?: number;
};

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80);
  if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });
  const base =
    process.env.OPEN_METEO_GEOCODING_URL ||
    "https://geocoding-api.open-meteo.com/v1/search";
  const url = new URL(base);
  url.searchParams.set("name", query);
  url.searchParams.set("count", "12");
  url.searchParams.set("language", "en");
  if (process.env.OPEN_METEO_API_KEY && base.includes("customer-"))
    url.searchParams.set("apikey", process.env.OPEN_METEO_API_KEY);
  try {
    const response = await fetch(url, {
      next: { revalidate: 24 * 60 * 60 },
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Geocoding returned ${response.status}`);
    const data = (await response.json()) as { results?: GeocodingResult[] };
    const suggestions = (data.results || [])
      .filter((item) => ["CA", "US"].includes(item.country_code || ""))
      .sort((a, b) => (b.population || 0) - (a.population || 0))
      .slice(0, 8)
      .map((item) => ({
        id: String(item.id),
        city: item.name,
        region: item.admin1 || "",
        country: item.country_code || "",
        label: [item.name, item.admin1, item.country_code]
          .filter(Boolean)
          .join(", "),
        latitude: item.latitude,
        longitude: item.longitude,
      }));
    return NextResponse.json({ suggestions });
  } catch {
    const rows = await sqlClient<
      Array<{
        city: string;
        region: string;
        country: string;
        latitude: number;
        longitude: number;
      }>
    >`
      SELECT city, region, country, avg(latitude)::float8 AS latitude,
        avg(longitude)::float8 AS longitude
      FROM campgrounds
      WHERE active = true AND city <> '' AND city <> 'Unknown'
        AND (city || ' ' || region) ILIKE ${`%${query}%`}
      GROUP BY city, region, country
      ORDER BY CASE WHEN city ILIKE ${`${query}%`} THEN 0 ELSE 1 END,
        count(*) DESC, city
      LIMIT 8
    `;
    return NextResponse.json({
      suggestions: rows.map((item) => ({
        id: `campgrounds:${item.city}:${item.region}:${item.country}`,
        city: item.city,
        region: item.region,
        country: item.country,
        label: [item.city, item.region, item.country]
          .filter(Boolean)
          .join(", "),
        latitude: item.latitude,
        longitude: item.longitude,
      })),
    });
  }
}
