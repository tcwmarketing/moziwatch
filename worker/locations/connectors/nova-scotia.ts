import { fetchWithRetry } from "../retry";
import { classifyCampground, validWgs84 } from "../classification";
import {
  normalizeName,
  type LocationImportItem,
  type NormalizedLocation,
} from "../types";

const SOURCE_URL =
  "https://data.novascotia.ca/resource/c6mf-qy4u.json?$limit=50000";
const DATASET_URL = "https://data.novascotia.ca/datasets/c6mf-qy4u";

export function normalizeNovaScotiaPark(
  row: Record<string, unknown>,
): LocationImportItem {
  const name = typeof row.name_full === "string" ? row.name_full.trim() : "";
  const externalId = normalizeName(name) || null;
  const point = row.the_geom as
    { type?: string; coordinates?: unknown } | undefined;
  const coordinates = point?.coordinates;
  const longitude = Array.isArray(coordinates) ? Number(coordinates[0]) : NaN;
  const latitude = Array.isArray(coordinates) ? Number(coordinates[1]) : NaN;
  if (!validWgs84(longitude, latitude))
    return {
      rejected: true,
      source: "nova-scotia-parks",
      externalId,
      reason: "invalid_coordinates",
      invalidCoordinates: true,
    };
  const parkType = typeof row.park_type === "string" ? row.park_type : "";
  const decision = classifyCampground({
    name,
    facilityType: `${parkType} camping park`,
    hasCampingActivity: parkType.toLowerCase() === "camping",
  });
  if (!decision.accepted)
    return {
      rejected: true,
      source: "nova-scotia-parks",
      externalId,
      reason: decision.reason,
    };
  return {
    source: "nova-scotia-parks",
    externalId: externalId!,
    sourceUrl: DATASET_URL,
    sourceRecordUrl: "https://parks.novascotia.ca/parks/all/camping",
    sourceRelease: "c6mf-qy4u-live",
    sourceUpdatedAt: null,
    license: "Open Government Licence - Nova Scotia",
    attribution: "Government of Nova Scotia",
    priority: 90,
    authoritative: true,
    name,
    normalizedName: normalizeName(name),
    locationType: decision.locationType,
    country: "CA",
    region: "NS",
    locality: "Unknown",
    address: "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: "Nova Scotia Parks",
    website: "https://parks.novascotia.ca/parks/all/camping",
    phone: null,
    reservationUrl: "https://parks.novascotia.ca/make-reservation",
    description: "Nova Scotia provincial camping park entrance.",
    parentName: null,
    raw: row,
  } satisfies NormalizedLocation;
}

export async function* novaScotiaRecords(): AsyncGenerator<LocationImportItem> {
  const response = await fetchWithRetry(SOURCE_URL, {});
  const rows = (await response.json()) as Record<string, unknown>[];
  const seen = new Set<string>();
  for (const row of rows) {
    const record = normalizeNovaScotiaPark(row);
    if (!("rejected" in record) && seen.has(record.externalId)) {
      yield {
        rejected: true,
        source: "nova-scotia-parks",
        externalId: record.externalId,
        reason: "duplicate_entrance",
      };
      continue;
    }
    if (!("rejected" in record)) seen.add(record.externalId);
    yield record;
  }
}
