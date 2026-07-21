import { normalizeOsmFeature } from "./osm";
import type { CoverageGap } from "../coverage-audit";

type OverpassElement = {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

const DEFAULT_OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
];

export function overpassEndpoints() {
  const configured =
    process.env.OVERPASS_API_URLS || process.env.OVERPASS_API_URL;
  const endpoints = configured
    ? configured
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : DEFAULT_OVERPASS_URLS;
  return [...new Set(endpoints)];
}

export function overpassGapQuery(gaps: CoverageGap[]) {
  const selectors = gaps.flatMap((gap) => {
    const radius = Math.round(gap.expectedRadiusKm * 1_000);
    const location = `${radius},${gap.latitude},${gap.longitude}`;
    return [
      `nwr(around:${location})["tourism"="camp_site"]["name"];`,
      `nwr(around:${location})["tourism"="caravan_site"]["name"];`,
    ];
  });
  return `[out:json][timeout:120];(${selectors.join("")});out center tags;`;
}

function distanceSquared(
  latitude: number,
  longitude: number,
  gap: CoverageGap,
) {
  const longitudeScale = Math.cos((latitude * Math.PI) / 180);
  return (
    (latitude - gap.latitude) ** 2 +
    ((longitude - gap.longitude) * longitudeScale) ** 2
  );
}

export async function queryOverpassBatch(gaps: CoverageGap[]) {
  let lastError: Error | null = null;
  const endpoints = overpassEndpoints();
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
          "User-Agent": "Moziwatch campground coverage audit",
        },
        body: new URLSearchParams({ data: overpassGapQuery(gaps) }),
        signal: AbortSignal.timeout(90_000),
      });
      if (!response.ok)
        throw new Error(`Overpass returned HTTP ${response.status}`);
      const payload = (await response.json()) as {
        elements?: OverpassElement[];
      };
      return payload.elements || [];
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (index < endpoints.length - 1)
        await new Promise((resolve) => setTimeout(resolve, 2_000));
    }
  }
  throw lastError || new Error("Overpass request failed");
}

export async function* osmOverpassGapRecords(gaps: CoverageGap[]) {
  const seen = new Set<string>();
  const batchSize = Math.max(
    1,
    Math.min(4, Number(process.env.OVERPASS_GAP_BATCH_SIZE || 1)),
  );
  for (let offset = 0; offset < gaps.length; offset += batchSize) {
    const batch = gaps.slice(offset, offset + batchSize);
    const elements = await queryOverpassBatch(batch);
    for (const element of elements) {
      const key = `${element.type}/${element.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const latitude = element.lat ?? element.center?.lat;
      const longitude = element.lon ?? element.center?.lon;
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
      const nearest = [...batch].sort(
        (left, right) =>
          distanceSquared(latitude!, longitude!, left) -
          distanceSquared(latitude!, longitude!, right),
      )[0];
      const properties = {
        ...(element.tags || {}),
        "@type": element.type,
        "@id": String(element.id),
        "addr:country": element.tags?.["addr:country"] || nearest.country,
        "addr:state": element.tags?.["addr:state"] || nearest.region,
      };
      const record = normalizeOsmFeature(
        {
          type: "Feature",
          id: element.id,
          geometry: { type: "Point", coordinates: [longitude, latitude] },
          properties,
        },
        nearest.country,
      );
      if (record) yield record;
    }
    if (offset + batch.length < gaps.length)
      await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}
