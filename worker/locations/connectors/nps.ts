import { fetchWithRetry } from "../retry";
import {
  normalizeName,
  positiveCampsiteCount,
  type NormalizedLocation,
} from "../types";

type NpsPayload = { total?: string; data?: Record<string, unknown>[] };
const value = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "string" && row[key] ? String(row[key]).trim() : null;

export function normalizeNpsCampground(
  row: Record<string, unknown>,
): NormalizedLocation | null {
  const id = value(row, "id");
  const name = value(row, "name");
  const latitude = Number(row.latitude);
  const longitude = Number(row.longitude);
  if (!id || !name || !Number.isFinite(latitude) || !Number.isFinite(longitude))
    return null;
  const addresses = Array.isArray(row.addresses)
    ? (row.addresses as Record<string, unknown>[])
    : [];
  const address =
    addresses.find((item) => item.type === "Physical") || addresses[0] || {};
  const contacts = (row.contacts || {}) as Record<string, unknown>;
  const phones = Array.isArray(contacts.phoneNumbers)
    ? (contacts.phoneNumbers as Record<string, unknown>[])
    : [];
  const parkCode = value(row, "parkCode");
  const campsites =
    row.campsites && typeof row.campsites === "object"
      ? (row.campsites as Record<string, unknown>)
      : {};
  const campsiteCount = positiveCampsiteCount(campsites.totalSites);
  return {
    source: "nps",
    externalId: id,
    sourceUrl:
      value(row, "url") ||
      (parkCode
        ? `https://www.nps.gov/${parkCode}/planyourvisit/campgrounds.htm`
        : null),
    license: "US-Government-Work-NPS-API-Terms",
    attribution: "National Park Service",
    priority: 82,
    name,
    normalizedName: normalizeName(name),
    locationType: /group/i.test(name)
      ? "group_campground"
      : /backcountry|primitive/i.test(
            `${name} ${value(row, "description") || ""}`,
          )
        ? "backcountry_campground"
        : "developed_campground",
    country: "US",
    region: value(address, "stateCode") || "Unknown",
    locality: value(address, "city") || "Unknown",
    address:
      [value(address, "line1"), value(address, "postalCode")]
        .filter(Boolean)
        .join(" ") || "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: "National Park Service",
    website: value(row, "url"),
    phone: phones.length ? value(phones[0], "phoneNumber") : null,
    reservationUrl: value(row, "reservationUrl"),
    description: value(row, "description"),
    parentName: value(row, "parkCode"),
    campsiteCount,
    campsiteCountKind: campsiteCount ? "official_total" : null,
    raw: row,
  };
}

export async function* npsRecords(start = 0) {
  const apiKey = process.env.NPS_API_KEY;
  if (!apiKey) throw new Error("NPS_API_KEY is required");
  const base = process.env.NPS_BASE_URL || "https://developer.nps.gov/api/v1";
  const limit = 500;
  for (let offset = start; ; offset += limit) {
    const url = new URL(`${base.replace(/\/$/, "")}/campgrounds`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("start", String(offset));
    const response = await fetchWithRetry(url.toString(), {
      headers: { "X-Api-Key": apiKey },
    });
    const json = (await response.json()) as NpsPayload;
    const rows = json.data || [];
    for (const row of rows) {
      const record = normalizeNpsCampground(row);
      if (record) yield record;
    }
    if (rows.length < limit || offset + rows.length >= Number(json.total || 0))
      break;
  }
}
