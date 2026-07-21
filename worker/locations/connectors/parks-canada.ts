import { fetchWithRetry } from "../retry";
import { classifyCampground, validWgs84 } from "../classification";
import {
  normalizeName,
  type LocationImportItem,
  type NormalizedLocation,
} from "../types";

const SOURCE_URL =
  "https://opendata.arcgis.com/datasets/85d09f00b6454413bd51dea2846d9d98_0.geojson";
const BC_CODES = new Set([
  "GINPR",
  "FRH",
  "FTL",
  "PRN",
  "KOONP",
  "YNP",
  "MRG",
  "GLA",
]);
const REGION_BY_CODE: Record<string, string> = {
  BAN: "AB",
  JNP: "AB",
  WBNP: "AB",
  PEI: "PE",
  GROS: "NL",
};

type Feature = {
  properties?: Record<string, unknown>;
  geometry?: { type?: string; coordinates?: unknown };
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function codeOf(properties: Record<string, unknown>) {
  const value = text(properties.URL_f) || text(properties.URL_e);
  const match = value.match(/^([A-Z][A-Z0-9]{1,8})-/);
  if (match?.[1]) return match[1];
  const lower = value.toLowerCase();
  const pathCodes: Array<[string, string]> = [
    ["/banff/", "BAN"],
    ["/jasper/", "JNP"],
    ["/kootenay/", "KOONP"],
    ["/yoho/", "YNP"],
    ["/glacier/", "GLA"],
    ["/revelstoke/", "MRG"],
  ];
  return pathCodes.find(([path]) => lower.includes(path))?.[1] || "";
}

function groupKey(feature: Feature) {
  const properties = feature.properties || {};
  const name = normalizeName(text(properties.Name_e));
  const code = codeOf(properties);
  const coordinates = feature.geometry?.coordinates;
  const grid =
    Array.isArray(coordinates) &&
    typeof coordinates[0] === "number" &&
    typeof coordinates[1] === "number"
      ? `${Math.round(coordinates[0] * 20) / 20}:${Math.round(coordinates[1] * 20) / 20}`
      : "unknown";
  return `${code || grid}:${name}`;
}

function isBritishColumbiaFeature(feature: Feature) {
  const properties = feature.properties || {};
  const code = codeOf(properties);
  const url =
    `${text(properties.URL_e)} ${text(properties.URL_f)}`.toLowerCase();
  const name = text(properties.Name_e).toLowerCase();
  const coordinates = feature.geometry?.coordinates;
  return (
    BC_CODES.has(code) ||
    /\/(bc|colombie-britannique)\//.test(url) ||
    /\b(takakkaw falls|mount robson|hamber provincial|whitehorse provincial)\b/.test(
      name,
    ) ||
    (Array.isArray(coordinates) &&
      typeof coordinates[0] === "number" &&
      coordinates[0] < -120)
  );
}

export function normalizeParksCanadaGroup(
  features: Feature[],
): LocationImportItem {
  const first = features[0];
  const properties = first?.properties || {};
  const name = text(properties.Name_e);
  const type = text(properties.Accommodation_Type);
  const code = codeOf(properties);
  const rawUrl = `${text(properties.URL_e)} ${text(properties.URL_f)}`;
  const coordinates = features
    .map((feature) => feature.geometry?.coordinates)
    .filter(
      (value): value is [number, number] =>
        Array.isArray(value) &&
        typeof value[0] === "number" &&
        typeof value[1] === "number" &&
        validWgs84(value[0], value[1]),
    );
  const externalId = groupKey(first);
  if (!coordinates.length)
    return {
      rejected: true,
      source: "parks-canada",
      externalId,
      reason: "invalid_coordinates",
      invalidCoordinates: true,
    };
  const [longitude, latitude] = coordinates
    .reduce(([x, y], value) => [x + value[0], y + value[1]], [0, 0])
    .map((value) => value / coordinates.length);
  if (features.some(isBritishColumbiaFeature))
    return {
      rejected: true,
      source: "parks-canada",
      externalId,
      reason: "british_columbia_excluded",
    };
  if (/-OOP-/i.test(rawUrl))
    return {
      rejected: true,
      source: "parks-canada",
      externalId,
      reason: "outside_parks_canada_campground_inventory",
    };
  const decision = classifyCampground({
    name,
    facilityType: type,
    hasCampingActivity: /camping/i.test(type),
    individualSite: /^\d+$/.test(name) || /^\w?\d+$/.test(name),
  });
  if (!decision.accepted)
    return {
      rejected: true,
      source: "parks-canada",
      externalId,
      reason: decision.reason,
    };

  return {
    source: "parks-canada",
    externalId,
    sourceUrl: SOURCE_URL,
    sourceRecordUrl:
      "https://open.canada.ca/data/en/dataset/85d09f00-b645-4413-bd51-dea2846d9d98",
    sourceRelease: "85d09f00b6454413bd51dea2846d9d98_0-live",
    sourceUpdatedAt: null,
    license: "Open Government Licence - Canada",
    attribution: "Parks Canada",
    priority: 90,
    authoritative: true,
    name,
    normalizedName: normalizeName(name),
    locationType: decision.locationType,
    country: "CA",
    region: REGION_BY_CODE[code] || "Unknown",
    locality: "Unknown",
    address: "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: "Parks Canada",
    website: null,
    phone: null,
    reservationUrl: "https://reservation.pc.gc.ca/",
    description: `${type}. Consolidated from ${features.length} accommodation point${features.length === 1 ? "" : "s"}.`,
    parentName: null,
    raw: { code, features: features.map((feature) => feature.properties) },
  } satisfies NormalizedLocation;
}

export async function* parksCanadaRecords(): AsyncGenerator<LocationImportItem> {
  const response = await fetchWithRetry(SOURCE_URL, {});
  const payload = (await response.json()) as { features?: Feature[] };
  const groups = new Map<string, Feature[]>();
  for (const feature of payload.features || []) {
    const key = groupKey(feature);
    groups.set(key, [...(groups.get(key) || []), feature]);
  }
  for (const group of groups.values()) yield normalizeParksCanadaGroup(group);
}
