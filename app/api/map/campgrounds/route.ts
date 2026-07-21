import { NextResponse } from "next/server";
import {
  listCampgrounds,
  type MapBounds,
  type RatingPeriod,
} from "@/lib/campgrounds";
import { mapLocationScope } from "@/lib/map-query";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("period");
  const url = new URL(request.url);
  const period: RatingPeriod =
    requested === "historical" ? "historical" : "recent";
  const query = url.searchParams.get("q") || undefined;
  const scope = mapLocationScope(url.searchParams.get("scope"));
  const requestedZoom = Number(url.searchParams.get("zoom"));
  const zoom = Number.isFinite(requestedZoom)
    ? Math.max(2, Math.min(16, requestedZoom))
    : 9;
  const values = (url.searchParams.get("bbox") || "").split(",").map(Number);
  const bounds: MapBounds | undefined =
    values.length === 4 && values.every(Number.isFinite)
      ? {
          west: Math.max(-180, values[0]),
          south: Math.max(-90, values[1]),
          east: Math.min(180, values[2]),
          north: Math.min(90, values[3]),
        }
      : undefined;
  if (
    (!bounds && !query) ||
    (bounds && (bounds.west >= bounds.east || bounds.south >= bounds.north))
  )
    return NextResponse.json(
      { error: "A valid bbox or search query is required." },
      { status: 400 },
    );
  try {
    const features = await listCampgrounds(period, bounds, query, zoom, scope);
    const clustered = !query && zoom <= 8;
    const hasGroups = features.some(
      (feature) => "point_count" in feature.properties,
    );
    const hasLocations = features.some(
      (feature) => !("point_count" in feature.properties),
    );
    const mapMode = hasGroups
      ? hasLocations
        ? "mixed"
        : "clusters"
      : "markers";
    return NextResponse.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          "Cache-Control": clustered
            ? "public, max-age=120, s-maxage=300, stale-while-revalidate=1800"
            : "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
          "X-Map-Data-Mode": mapMode,
        },
      },
    );
  } catch (error) {
    console.error("Campground map data unavailable", error);
    return NextResponse.json(
      { error: "Campground data is temporarily unavailable." },
      { status: 503 },
    );
  }
}
