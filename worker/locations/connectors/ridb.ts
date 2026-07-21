import { readFile } from "node:fs/promises";
import { parse } from "csv-parse/sync";
import { fetchWithRetry } from "../retry";
import { classifyCampground, validWgs84 } from "../classification";
import { normalizeName, type NormalizedLocation } from "../types";

type RidbPayload = {
  RECDATA?: Record<string, unknown>[];
  METADATA?: { RESULTS?: { TOTAL_COUNT?: number } };
};

const value = (row: Record<string, unknown>, key: string) =>
  typeof row[key] === "string" && row[key] ? String(row[key]).trim() : null;

const limitedValue = (
  row: Record<string, unknown>,
  key: string,
  maximumLength: number,
) => value(row, key)?.slice(0, maximumLength) || null;

export function normalizeRidbFacility(
  row: Record<string, unknown>,
): NormalizedLocation | null {
  const id = row.FacilityID;
  const sourceName = value(row, "FacilityName");
  const latitude = Number(row.FacilityLatitude);
  const longitude = Number(row.FacilityLongitude);
  const type = `${value(row, "FacilityTypeDescription") || ""} ${value(row, "FacilityDescription") || ""}`;
  if (!id || !sourceName || !validWgs84(longitude, latitude)) return null;
  const name = sourceName.slice(0, 160);
  const decision = classifyCampground({
    name,
    facilityType: type,
    description: value(row, "FacilityDescription"),
    hasCampingActivity: /camp/i.test(type) || row.__campingActivity === true,
  });
  if (!decision.accepted) return null;
  return {
    source: "ridb",
    externalId: String(id),
    sourceUrl:
      value(row, "FacilityReservationURL") ||
      `https://www.recreation.gov/camping/campgrounds/${id}`,
    license: "RIDB-API-Access-Agreement",
    attribution: "Data source: RIDB / Recreation.gov",
    priority: 80,
    authoritative: true,
    sourceRecordUrl: value(row, "FacilityReservationURL"),
    sourceRelease: value(row, "LastUpdatedDate"),
    sourceUpdatedAt: value(row, "LastUpdatedDate"),
    name,
    normalizedName: normalizeName(name),
    locationType: decision.locationType,
    country: "US",
    region: limitedValue(row, "FacilityState", 100) || "Unknown",
    locality: limitedValue(row, "FacilityCity", 100) || "Unknown",
    address:
      limitedValue(row, "FacilityAddress1", 220) || "Address not provided",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: value(row, "OrgName"),
    website: value(row, "FacilityURL"),
    phone: limitedValue(row, "FacilityPhone", 60),
    reservationUrl: value(row, "FacilityReservationURL"),
    description: value(row, "FacilityDescription"),
    parentName: value(row, "RecAreaName"),
    raw: row,
  };
}

async function resolveCampingActivityId(base: string, apiKey: string) {
  const url = new URL(`${base.replace(/\/$/, "")}/activities`);
  url.searchParams.set("limit", "100");
  url.searchParams.set("offset", "0");
  const response = await fetchWithRetry(url.toString(), {
    headers: { apikey: apiKey },
  });
  const json = (await response.json()) as {
    RECDATA?: Record<string, unknown>[];
  };
  const camping = (json.RECDATA || []).find(
    (row) =>
      String(row.ActivityName || row.ACTIVITYNAME || "")
        .trim()
        .toLowerCase() === "camping",
  );
  const id = camping?.ActivityID || camping?.ACTIVITYID;
  if (!id)
    throw new Error(
      "RIDB activities endpoint did not return the Camping activity ID",
    );
  return String(id);
}

async function* ridbBulkRecords(file: string) {
  const contents = await readFile(file, "utf8");
  const rows = file.toLowerCase().endsWith(".json")
    ? ((JSON.parse(contents).RECDATA || JSON.parse(contents)) as Record<
        string,
        unknown
      >[])
    : (parse(contents, {
        columns: true,
        skip_empty_lines: true,
        bom: true,
      }) as Record<string, unknown>[]);
  for (const row of rows) {
    row.__campingActivity = true;
    const record = normalizeRidbFacility(row);
    if (record) yield record;
  }
}

export async function* ridbRecords(startOffset = 0) {
  const bulkFile = process.env.RIDB_BULK_FILE;
  if (bulkFile) {
    yield* ridbBulkRecords(bulkFile);
    return;
  }
  const apiKey = process.env.RIDB_API_KEY;
  if (!apiKey) throw new Error("RIDB_API_KEY is required");
  const base =
    process.env.RIDB_BASE_URL || "https://ridb.recreation.gov/api/v1";
  const campingActivityId = await resolveCampingActivityId(base, apiKey);
  const limit = 50;
  for (let offset = startOffset; ; offset += limit) {
    const url = new URL(`${base.replace(/\/$/, "")}/facilities`);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    url.searchParams.set("activity", campingActivityId);
    const response = await fetchWithRetry(url.toString(), {
      headers: { apikey: apiKey },
    });
    const json = (await response.json()) as RidbPayload;
    const rows = json.RECDATA || [];
    for (const row of rows) {
      row.__campingActivity = true;
      const record = normalizeRidbFacility(row);
      if (record) yield record;
    }
    const total = Number(json.METADATA?.RESULTS?.TOTAL_COUNT || 0);
    if (rows.length < limit || (total && offset + rows.length >= total)) break;
  }
}
