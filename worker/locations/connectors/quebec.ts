import { fetchWithRetry } from "../retry";
import { classifyCampground, validWgs84 } from "../classification";
import {
  normalizeName,
  positiveCampsiteCount,
  type LocationImportItem,
  type NormalizedLocation,
} from "../types";

const SOURCE_URL =
  "https://api-v3.tourinsoft.com/api/syndications/mto.tourinsoft.com/81ef2c59-bd09-41bd-b2d6-fa63bcbd9765?format=json";

const first = (row: Record<string, unknown>, key: string) =>
  Array.isArray(row[key])
    ? (row[key] as Record<string, unknown>[])[0] || {}
    : {};
const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

export function normalizeQuebecCampground(
  row: Record<string, unknown>,
): LocationImportItem {
  const externalId = text(row.SyndicObjectID) || null;
  const name = text(row.SyndicObjectName);
  const geo = first(row, "Geolocalisations");
  const latitude = Number(geo.Latitude);
  const longitude = Number(geo.Longitude);
  if (!externalId || !validWgs84(longitude, latitude))
    return {
      rejected: true,
      source: "quebec-tourism",
      externalId,
      reason: "invalid_coordinates",
      invalidCoordinates: true,
    };
  const sites = first(row, "Emplacementss");
  const campingSites = positiveCampsiteCount(sites.Sitesacamper) || 0;
  const readyToCampSites = positiveCampsiteCount(sites.Pretsacamper) || 0;
  const campsiteCount = campingSites + readyToCampSites || null;
  const tentOrMixed = campingSites > 0 || readyToCampSites > 0;
  const decision = classifyCampground({
    name,
    category: text(row.ObjectTypeName),
    facilityType: text(row.ObjectTypeName),
    hasCampingActivity: text(row.ObjectTypeName).toLowerCase() === "camping",
    hasTentOrMixedSites: tentOrMixed,
    description: JSON.stringify(row.ExperiencesHebergementDisponibless || []),
  });
  if (!decision.accepted)
    return {
      rejected: true,
      source: "quebec-tourism",
      externalId,
      reason: decision.reason,
    };
  const address = first(row, "Adresses");
  const website = text(first(row, "SiteInternets").Coordonnees) || null;
  const phone = text(first(row, "TelephonePrincipals").Coordonnees) || null;
  const zones = Array.isArray(row.ZonesGeographiquess)
    ? (row.ZonesGeographiquess as Record<string, unknown>[])
    : [];
  const locality =
    text(address.Municipalite) ||
    text(zones.find((zone) => Number(zone.Ordre) === 11)?.ZoneLibelle) ||
    "Unknown";
  return {
    source: "quebec-tourism",
    externalId,
    sourceUrl: SOURCE_URL,
    sourceRecordUrl: website,
    sourceRelease: text(row.Updated) || "tourinsoft-live",
    sourceUpdatedAt: text(row.Updated) || null,
    license: "CC BY 4.0",
    attribution: "Ministère du Tourisme du Québec / Camping Québec",
    priority: 90,
    authoritative: true,
    name,
    normalizedName: normalizeName(name),
    locationType: decision.locationType,
    country: "CA",
    region: "QC",
    locality,
    address:
      [text(address.Numerovoie), locality, text(address.CodePostal)]
        .filter(Boolean)
        .join(", ") || "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: null,
    website,
    phone,
    reservationUrl: website,
    description: tentOrMixed
      ? "Registered campground with camping or ready-to-camp sites."
      : "Registered campground.",
    parentName: null,
    campsiteCount,
    campsiteCountKind: campsiteCount ? "official_total" : null,
    raw: row,
  } satisfies NormalizedLocation;
}

export async function* quebecRecords(): AsyncGenerator<LocationImportItem> {
  const response = await fetchWithRetry(SOURCE_URL, {});
  const payload = (await response.json()) as {
    value?: Record<string, unknown>[];
  };
  for (const row of payload.value || []) yield normalizeQuebecCampground(row);
}
