import { fetchWithRetry } from "../retry";
import { classifyCampground, validWgs84 } from "../classification";
import {
  normalizeName,
  type LocationImportItem,
  type NormalizedLocation,
} from "../types";

const LAYER =
  "https://apps.fs.usda.gov/arcx/rest/services/EDW/EDW_RecreationOpportunities_01/MapServer/0";

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function normalizeUsfsCampground(
  feature: Record<string, unknown>,
): LocationImportItem {
  const properties = (feature.properties || {}) as Record<string, unknown>;
  const id = properties.recareaid ? String(properties.recareaid) : null;
  const name = text(properties.recareaname);
  const geometry = feature.geometry as { coordinates?: unknown } | undefined;
  const coordinates = geometry?.coordinates;
  const sourceLongitude = Array.isArray(coordinates)
    ? Number(coordinates[0])
    : Number(properties.longitude);
  // Some Forest Service records publish western longitudes without the minus
  // sign. Every USFS recreation point is in the western hemisphere.
  const longitude = sourceLongitude > 0 ? -sourceLongitude : sourceLongitude;
  const latitude = Array.isArray(coordinates)
    ? Number(coordinates[1])
    : Number(properties.latitude);
  if (!id || !validWgs84(longitude, latitude))
    return {
      rejected: true,
      source: "usfs",
      externalId: id,
      reason: "invalid_coordinates",
      invalidCoordinates: true,
    };
  const activity = `${text(properties.markeractivity)} ${text(properties.markeractivitygroup)}`;
  const status = text(properties.openstatus);
  const decision = classifyCampground({
    name,
    category: activity,
    facilityType: activity,
    description: text(properties.recareadescription),
    hasCampingActivity: /campground|camping/i.test(activity),
    permanentlyClosed: /permanent/i.test(status) && /closed/i.test(status),
  });
  if (!decision.accepted)
    return {
      rejected: true,
      source: "usfs",
      externalId: id,
      reason: decision.reason,
    };
  const recordUrl = text(properties.recareaurl) || null;
  return {
    source: "usfs",
    externalId: id,
    sourceUrl: LAYER,
    sourceRecordUrl: recordUrl,
    sourceRelease: "nightly",
    sourceUpdatedAt: null,
    license: "U.S. Government work / USDA Forest Service data disclaimer",
    attribution: "USDA Forest Service",
    priority: 85,
    authoritative: true,
    name,
    normalizedName: normalizeName(name),
    locationType: decision.locationType,
    country: "US",
    region: "Unknown",
    locality: "Unknown",
    address: "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: text(properties.forestname) || "USDA Forest Service",
    website: recordUrl,
    phone: null,
    reservationUrl: text(properties.reservation_info) || null,
    description: text(properties.recareadescription) || null,
    parentName: text(properties.forestname) || null,
    raw: properties,
  } satisfies NormalizedLocation;
}

export async function* usfsRecords(): AsyncGenerator<LocationImportItem> {
  const pageSize = 1000;
  for (let offset = 0; ; offset += pageSize) {
    const url = new URL(`${LAYER}/query`);
    url.searchParams.set(
      "where",
      "markeractivity LIKE '%Camp%' OR markeractivitygroup LIKE '%Camp%'",
    );
    url.searchParams.set("outFields", "*");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "geojson");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(pageSize));
    const response = await fetchWithRetry(url.toString(), {});
    const payload = (await response.json()) as {
      features?: Record<string, unknown>[];
    };
    const features = payload.features || [];
    for (const feature of features) yield normalizeUsfsCampground(feature);
    if (features.length < pageSize) break;
  }
}
