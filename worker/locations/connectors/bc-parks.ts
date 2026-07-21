import { fetchWithRetry } from "../retry";
import { normalizeName, type NormalizedLocation } from "../types";
import { inferBcParksLocality } from "../bc-locality";

type ProtectedArea = Record<string, unknown> & {
  id?: number;
  orcs?: number;
  protectedAreaName?: string;
  legalStatus?: string;
  url?: string;
  latitude?: number;
  longitude?: number;
  description?: string;
  locationNotes?: string;
};

type ParkCampingType = Record<string, unknown> & {
  id?: number;
  name?: string;
  isActive?: boolean;
  protectedArea?: ProtectedArea;
  campingType?: Record<string, unknown> & {
    campingTypeName?: string;
    campingTypeCode?: string;
  };
};

type ParkOperationSubArea = Record<string, unknown> & {
  id?: number;
  parkSubArea?: string;
  isActive?: boolean;
  hasReservations?: boolean;
  frontcountrySites?: string | number | null;
  vehicleSites?: string | number | null;
  walkInSites?: string | number | null;
  groupSites?: string | number | null;
  backcountrySites?: string | number | null;
  protectedArea?: ProtectedArea;
  parkSubAreaType?: Record<string, unknown> & {
    subAreaType?: string;
    subAreaTypeCode?: string;
  };
};

type ApiPayload<T> = {
  data?: T[];
  meta?: { pagination?: { page?: number; pageCount?: number } };
};

const CAMPGROUND_TYPE_CODES = new Set([
  "backcountry-camping",
  "frontcountry-camping",
  "group-camping",
  "marine-accessible-camping",
  "rv",
  "walk-in-camping",
]);

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

function plainText(value: unknown) {
  const html = text(value);
  if (!html) return null;
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function count(value: unknown) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

function withoutProtectedArea<T extends { protectedArea?: ProtectedArea }>(
  row: T,
) {
  const copy = { ...row };
  delete copy.protectedArea;
  return copy;
}

function officialCampsiteCount(rows: ParkOperationSubArea[]) {
  const totals = {
    frontcountry: rows.reduce(
      (sum, row) => sum + count(row.frontcountrySites),
      0,
    ),
    backcountry: rows.reduce(
      (sum, row) => sum + count(row.backcountrySites),
      0,
    ),
    walkIn: rows.reduce((sum, row) => sum + count(row.walkInSites), 0),
    vehicle: rows.reduce((sum, row) => sum + count(row.vehicleSites), 0),
    group: rows.reduce((sum, row) => sum + count(row.groupSites), 0),
  };
  return (
    totals.frontcountry ||
    totals.backcountry ||
    totals.walkIn ||
    totals.vehicle ||
    totals.group ||
    null
  );
}

export function normalizeBcParksCampground(
  protectedArea: ProtectedArea,
  campingTypes: ParkCampingType[],
  subAreas: ParkOperationSubArea[],
): NormalizedLocation | null {
  const id = protectedArea.orcs ?? protectedArea.id;
  const name = text(protectedArea.protectedAreaName);
  const latitude = Number(protectedArea.latitude);
  const longitude = Number(protectedArea.longitude);
  const activeSubAreas = subAreas.filter((row) => {
    const code = text(row.parkSubAreaType?.subAreaTypeCode);
    return (
      row.isActive === true && Boolean(code && CAMPGROUND_TYPE_CODES.has(code))
    );
  });
  if (
    !id ||
    !name ||
    protectedArea.legalStatus !== "Active" ||
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    !activeSubAreas.length
  )
    return null;

  const codes = new Set(
    campingTypes
      .filter((row) => row.isActive !== false)
      .map((row) => text(row.campingType?.campingTypeCode))
      .filter((code): code is string => Boolean(code)),
  );
  for (const row of activeSubAreas) {
    const code = text(row.parkSubAreaType?.subAreaTypeCode);
    if (code) codes.add(code);
  }
  const facilityLabels = [
    ...new Set(
      campingTypes
        .filter((row) => row.isActive !== false)
        .map((row) => text(row.campingType?.campingTypeName))
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  if (activeSubAreas.some((row) => row.hasReservations))
    facilityLabels.push("Reservable campsites");
  const campsiteCount = officialCampsiteCount(activeSubAreas);
  const locationType =
    codes.has("frontcountry-camping") || codes.has("rv")
      ? "developed_campground"
      : codes.size === 1 && codes.has("group-camping")
        ? "group_campground"
        : "backcountry_campground";
  const sourceUrl =
    text(protectedArea.url) ||
    `https://bcparks.ca/?s=${encodeURIComponent(name)}`;

  return {
    source: "bc-parks",
    externalId: String(id),
    sourceUrl,
    license: "Open-Government-Licence-BC",
    attribution: "BC Parks Data API, Government of British Columbia",
    priority: 88,
    name,
    normalizedName: normalizeName(name),
    locationType,
    country: "CA",
    region: "BC",
    locality: inferBcParksLocality(protectedArea),
    address: "BC Parks",
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: "BC Parks",
    website: sourceUrl,
    phone: null,
    reservationUrl: "https://camping.bcparks.ca/",
    description:
      plainText(protectedArea.description) ||
      plainText(protectedArea.locationNotes),
    parentName: name,
    campsiteCount: campsiteCount || null,
    campsiteCountKind: campsiteCount ? "official_total" : null,
    raw: {
      protectedArea,
      campingTypes: campingTypes.map(withoutProtectedArea),
      subAreas: activeSubAreas.map(withoutProtectedArea),
      officialCampsiteCount: campsiteCount,
      facilityLabels,
    },
  };
}

async function fetchAll<T>(endpoint: string) {
  const base =
    process.env.BC_PARKS_API_BASE_URL || "https://bcparks.api.gov.bc.ca/api";
  const rows: T[] = [];
  const pageSize = 250;
  for (let page = 1; ; page++) {
    const url = new URL(`${base.replace(/\/$/, "")}/${endpoint}`);
    url.searchParams.set("populate", "*");
    url.searchParams.set("pagination[page]", String(page));
    url.searchParams.set("pagination[pageSize]", String(pageSize));
    url.searchParams.set("sort", "id:asc");
    const response = await fetchWithRetry(url.toString(), {
      headers: { Authorization: "None" },
    });
    const payload = (await response.json()) as ApiPayload<T>;
    rows.push(...(payload.data || []));
    const pageCount = Number(payload.meta?.pagination?.pageCount || 0);
    if (!payload.data?.length || (pageCount && page >= pageCount)) break;
  }
  return rows;
}

export async function* bcParksRecords() {
  const [campingTypes, subAreas] = await Promise.all([
    fetchAll<ParkCampingType>("park-camping-types"),
    fetchAll<ParkOperationSubArea>("park-operation-sub-areas"),
  ]);
  const grouped = new Map<
    string,
    {
      protectedArea: ProtectedArea;
      campingTypes: ParkCampingType[];
      subAreas: ParkOperationSubArea[];
    }
  >();
  for (const row of subAreas) {
    const area = row.protectedArea;
    const id = area?.orcs ?? area?.id;
    if (!area || !id) continue;
    const key = String(id);
    const group = grouped.get(key) || {
      protectedArea: area,
      campingTypes: [],
      subAreas: [],
    };
    group.subAreas.push(row);
    grouped.set(key, group);
  }
  for (const row of campingTypes) {
    const area = row.protectedArea;
    const id = area?.orcs ?? area?.id;
    const code = text(row.campingType?.campingTypeCode);
    if (!area || !id || !code || !CAMPGROUND_TYPE_CODES.has(code)) continue;
    const group = grouped.get(String(id));
    if (group) group.campingTypes.push(row);
  }
  for (const group of grouped.values()) {
    const record = normalizeBcParksCampground(
      group.protectedArea,
      group.campingTypes,
      group.subAreas,
    );
    if (record) yield record;
  }
}
