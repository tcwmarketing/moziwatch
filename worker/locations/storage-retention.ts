import type {
  GeoJsonGeometry,
  LocationSource,
  NormalizedLocation,
} from "./types";

const RAW_FIELDS: Partial<Record<LocationSource, readonly string[]>> = {
  "overture-ca": [
    "primary_category",
    "alternate_categories",
    "confidence",
    "operating_status",
    "version",
  ],
  "overture-us": [
    "primary_category",
    "alternate_categories",
    "confidence",
    "operating_status",
    "version",
  ],
  "bc-recreation": [
    "NUM_CAMP_SITES",
    "MAINTAIN_STD_DESC",
    "STRUCTURE_DESC1",
    "STRUCTURE_DESC2",
    "STRUCTURE_DESC3",
    "STRUCTURE_DESC4",
    "STRUCTURE_DESC5",
    "STRUCTURE_DESC6",
    "STRUCTURE_DESC7",
    "STRUCTURE_DESC8",
    "STRUCTURE_DESC9",
    "STRUCTURE_DESC10",
  ],
  "bc-parks": ["officialCampsiteCount", "facilityLabels"],
  "quebec-tourism": ["Emplacementss"],
  openstreetmap: [
    "capacity",
    "capacity:pitches",
    "capacity:tents",
    "capacity:caravans",
    "capacity:motorhome",
  ],
  nps: ["campsites"],
};

const EMAIL_PATTERN = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const NORMALIZED_FIELDS = new Set([
  "name",
  "normalizedName",
  "locationType",
  "country",
  "region",
  "locality",
  "address",
  "operator",
  "website",
  "phone",
  "reservationUrl",
  "parentName",
  "campsiteCount",
  "campsiteCountKind",
  "bootstrapSlug",
]);

function strings(value: unknown, output: string[]) {
  if (typeof value === "string") {
    output.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) strings(item, output);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) strings(item, output);
  }
}

function cleanMatch(value: string) {
  return value.replace(/[),.;\]}]+$/g, "");
}

export function retainedContacts(
  record: Pick<
    NormalizedLocation,
    "raw" | "sourceUrl" | "sourceRecordUrl" | "website" | "reservationUrl"
  >,
) {
  const values: string[] = [];
  strings(record.raw, values);
  strings(
    [
      record.sourceUrl,
      record.sourceRecordUrl,
      record.website,
      record.reservationUrl,
    ],
    values,
  );
  const emails = new Set<string>();
  const urls = new Set<string>();
  for (const value of values) {
    for (const email of value.match(EMAIL_PATTERN) || [])
      emails.add(email.toLowerCase());
    for (const url of value.match(URL_PATTERN) || []) urls.add(cleanMatch(url));
  }
  return {
    emails: [...emails].sort(),
    urls: [...urls].sort(),
  };
}

export function compactRawPayload(
  source: LocationSource,
  raw: Record<string, unknown>,
) {
  return Object.fromEntries(
    (RAW_FIELDS[source] || [])
      .map((key) => [key, raw[key]] as const)
      .filter(([, value]) => value !== null && value !== undefined),
  );
}

export function compactNormalizedPayload(record: NormalizedLocation) {
  return Object.fromEntries(
    Object.entries({
      name: record.name,
      normalizedName: record.normalizedName,
      locationType: record.locationType,
      country: record.country,
      region: record.region,
      locality: record.locality,
      address: record.address,
      operator: record.operator,
      website: record.website,
      phone: record.phone,
      reservationUrl: record.reservationUrl,
      parentName: record.parentName,
      campsiteCount: record.campsiteCount,
      campsiteCountKind: record.campsiteCountKind,
    }).filter(
      ([, value]) => value !== null && value !== undefined && value !== "",
    ),
  );
}

export function compactStoredNormalizedPayload(
  payload: Record<string, unknown>,
) {
  return Object.fromEntries(
    Object.entries(payload).filter(
      ([key, value]) =>
        NORMALIZED_FIELDS.has(key) &&
        value !== null &&
        value !== undefined &&
        value !== "",
    ),
  );
}

export function retainedSourceGeometry(geometry: GeoJsonGeometry) {
  return geometry.type === "Point" ? null : geometry;
}
