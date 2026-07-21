export type GeoJsonGeometry = {
  type: "Point" | "Polygon" | "MultiPolygon";
  coordinates: unknown;
};

export type LocationKind =
  | "developed_campground"
  | "rv_park"
  | "backcountry_campground"
  | "group_campground"
  | "other_established_campground";

export type LocationSource =
  | "openstreetmap"
  | "overture-ca"
  | "overture-us"
  | "ridb"
  | "nps"
  | "usfs"
  | "parks-canada"
  | "quebec-tourism"
  | "nova-scotia-parks"
  | "bc-recreation"
  | "bc-parks";

export type CampsiteCountKind =
  "official_total" | "reservable_inventory" | "mapped_capacity";

export type NormalizedLocation = {
  source: LocationSource;
  externalId: string;
  sourceUrl: string | null;
  license: string;
  attribution: string;
  priority: number;
  authoritative?: boolean;
  sourceRecordUrl?: string | null;
  sourceRelease?: string | null;
  sourceUpdatedAt?: string | null;
  confidence?: number | null;
  name: string;
  normalizedName: string;
  locationType: LocationKind;
  country: string;
  region: string;
  locality: string;
  address: string;
  geometry: GeoJsonGeometry;
  operator: string | null;
  website: string | null;
  phone: string | null;
  reservationUrl: string | null;
  description: string | null;
  parentName: string | null;
  campsiteCount?: number | null;
  campsiteCountKind?: CampsiteCountKind | null;
  raw: Record<string, unknown>;
};

export function positiveCampsiteCount(value: unknown) {
  const count = Number(value);
  return Number.isInteger(count) && count > 0 && count <= 100_000
    ? count
    : null;
}

export type RejectedLocation = {
  rejected: true;
  source: LocationSource;
  externalId: string | null;
  reason: string;
  invalidCoordinates?: boolean;
};

export type LocationImportItem = NormalizedLocation | RejectedLocation;

export type ImportOptions = {
  dryRun: boolean;
  limit?: number;
  batchSize: number;
  country?: string;
  region?: string;
  resumeRunId?: string;
  datasetVersion?: string;
};

export type ImportCounts = {
  downloaded: number;
  accepted: number;
  excluded: number;
  invalidCoordinates: number;
  duplicatesPrevented: number;
  inserted: number;
  updated: number;
  unchanged: number;
  matched: number;
  mergeCandidates: number;
  skipped: number;
};

export function normalizeName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(campground|camping|camp site|campsite)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

const EMBEDDED_NORTH_AMERICAN_PHONE =
  /(?:\+?1[\s.\-]?)?(?:\(\s*\d{3}\s*\)|\d{3})[\s.\-]*\d{3}[\s.\-]+\d{4}(?:\s*(?:x|ext\.?|extension)\s*\d+)?/gi;

/**
 * Removes source-feed formatting noise from a public campground name without
 * changing stable slugs. Phone numbers remain available in the dedicated
 * contact field; they should never be presented as part of the name.
 */
export function cleanDisplayName(value: string) {
  return value
    .replace(/^\s*[-\u2013\u2014\u2022]+\s*/, "")
    .replace(EMBEDDED_NORTH_AMERICAN_PHONE, "")
    .replace(/\s*[:|,;\-]+\s*$/, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function normalizePhone(value: string | null) {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 7 ? digits.slice(-10) : null;
}

export function websiteDomain(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

export function slugify(value: string) {
  return (
    normalizeName(value).replace(/\s+/g, "-").slice(0, 150) || "campground"
  );
}
