import { fetchWithRetry } from "../retry";
import {
  normalizeName,
  type GeoJsonGeometry,
  type NormalizedLocation,
} from "../types";

type ArcFeature = {
  type: "Feature";
  geometry?: GeoJsonGeometry;
  properties?: Record<string, unknown>;
};
type ArcPayload = { features?: ArcFeature[]; exceededTransferLimit?: boolean };
const value = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "string" && row[key] ? String(row[key]).trim() : null;

export function normalizeBcRecreationSite(
  feature: ArcFeature,
): NormalizedLocation | null {
  const row = feature.properties || {};
  const id = value(row, "FOREST_FILE_ID") || String(row.OBJECTID || "");
  const name = value(row, "PROJECT_NAME");
  const camps = Number(row.NUM_CAMP_SITES);
  if (!id || !name || !feature.geometry || !(camps > 0)) return null;
  return {
    source: "bc-recreation",
    externalId: id,
    sourceUrl: `https://sitesandtrailsbc.ca/search?q=${encodeURIComponent(name)}`,
    license: "Open-Government-Licence-BC",
    attribution:
      "Contains information licensed under the Open Government Licence - British Columbia",
    priority: 80,
    name,
    normalizedName: normalizeName(name),
    locationType: /backcountry|wilderness/i.test(
      `${name} ${value(row, "PROJECT_DESCRIPTION") || ""}`,
    )
      ? "backcountry_campground"
      : "other_established_campground",
    country: "CA",
    region: "BC",
    locality: value(row, "SITE_LOCATION") || "Unknown",
    address: value(row, "SITE_LOCATION") || "Address not provided",
    geometry: feature.geometry,
    operator:
      value(row, "OPERATOR_CLIENT_NAME") ||
      value(row, "OPERATOR_LEGAL_FIRST_NAME"),
    website: null,
    phone: value(row, "OPERATOR_BUSINESS_PHONE"),
    reservationUrl: null,
    description:
      value(row, "PROJECT_DESCRIPTION") || value(row, "DRIVING_DIRECTIONS"),
    parentName: value(row, "REC_DISTRICT_CODE_DESC"),
    campsiteCount: camps,
    campsiteCountKind: "official_total",
    raw: row,
  };
}

export async function* bcRecords(startOffset = 0) {
  const endpoint =
    process.env.BC_RECREATION_ARCGIS_URL ||
    "https://delivery.maps.gov.bc.ca/arcgis/rest/services/whse/bcgw_pub_whse_forest_tenure/MapServer/13";
  const pageSize = 1_000;
  for (let offset = startOffset; ; offset += pageSize) {
    const url = new URL(`${endpoint.replace(/\/$/, "")}/query`);
    url.searchParams.set(
      "where",
      "NUM_CAMP_SITES > 0 AND PROJECT_NAME IS NOT NULL",
    );
    url.searchParams.set("outFields", "*");
    url.searchParams.set("returnGeometry", "true");
    url.searchParams.set("outSR", "4326");
    url.searchParams.set("f", "geojson");
    url.searchParams.set("resultOffset", String(offset));
    url.searchParams.set("resultRecordCount", String(pageSize));
    const response = await fetchWithRetry(url.toString(), {});
    const json = (await response.json()) as ArcPayload;
    const rows = json.features || [];
    for (const row of rows) {
      const record = normalizeBcRecreationSite(row);
      if (record) yield record;
    }
    if (rows.length < pageSize && !json.exceededTransferLimit) break;
  }
}
