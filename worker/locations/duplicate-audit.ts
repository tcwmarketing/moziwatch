import { toPostgresJson } from "@/lib/postgres-json";
import {
  campgroundNameIdentitySimilarity,
  campgroundWebsiteIdentity,
} from "./matching";
import { normalizePhone } from "./types";

export type CanonicalCampgroundRecord = {
  id: string;
  name: string;
  slug: string;
  verification: string;
  sourcePriority: number;
  sourceCount: number;
  reportCount: number;
  country: string;
  region: string;
  city: string;
  address: string;
  website: string | null;
  phone: string | null;
  latitude: number;
  longitude: number;
};

export type CanonicalDuplicateCandidate = {
  left: CanonicalCampgroundRecord;
  right: CanonicalCampgroundRecord;
  country: string;
  region: string;
  distanceMeters: number | null;
  nameIdentitySimilarity: number;
  matchScore: number;
  websiteMatch: boolean;
  phoneMatch: boolean;
  addressMatch: boolean;
  reasons: string[];
  recommendation: "automatic" | "review";
  suggestedSurvivorId: string;
};

export function summarizeDuplicateCandidateClusters(
  candidates: CanonicalDuplicateCandidate[],
) {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const current = parent.get(id);
    if (!current) {
      parent.set(id, id);
      return id;
    }
    if (current === id) return id;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot)
      parent.set(
        leftRoot < rightRoot ? rightRoot : leftRoot,
        leftRoot < rightRoot ? leftRoot : rightRoot,
      );
  };
  for (const candidate of candidates)
    union(candidate.left.id, candidate.right.id);

  const clusterSizes = new Map<string, number>();
  for (const id of parent.keys()) {
    const root = find(id);
    clusterSizes.set(root, (clusterSizes.get(root) || 0) + 1);
  }
  const sizes = [...clusterSizes.values()];
  return {
    pairCount: candidates.length,
    locationCount: parent.size,
    clusterCount: sizes.length,
    clustersWithMoreThanTwoLocations: sizes.filter((size) => size > 2).length,
    largestClusterSize: sizes.length ? Math.max(...sizes) : 0,
  };
}

const GRID_DEGREES = 0.02;
const DEFAULT_MAX_DISTANCE_METERS = 2_000;
const MAX_IDENTITY_BUCKET_SIZE = 50;
const PLACEHOLDER_ADDRESSES = new Set([
  "",
  "address not provided",
  "unknown",
  "not available",
]);
const DISTINCT_FACILITY_QUALIFIERS = new Set([
  "buoy",
  "cabin",
  "cabins",
  "corral",
  "day",
  "equestrian",
  "group",
  "horse",
  "loop",
  "marina",
  "mooring",
  "picnic",
  "ranger",
  "service",
  "shelter",
  "station",
  "stock",
  "visitor",
  "youth",
]);
const OPPOSING_FACILITY_QUALIFIERS = [
  ["upper", "lower"],
  ["east", "west"],
  ["north", "south"],
] as const;
const SHARED_SUBFACILITY_MARKERS = new Set([
  "cabin",
  "cabins",
  "campsite",
  "campsites",
  "group",
  "lot",
  "loop",
]);

export function canonicalQuality(value: CanonicalCampgroundRecord) {
  const verification =
    value.verification === "manually_verified"
      ? 300
      : value.verification === "owner_verified"
        ? 250
        : value.verification === "source_verified"
          ? 200
          : 0;
  return (
    verification +
    value.sourcePriority * 3 +
    value.sourceCount * 10 +
    value.reportCount * 5 +
    (value.website ? 4 : 0) +
    (value.address && !PLACEHOLDER_ADDRESSES.has(value.address.toLowerCase())
      ? 2
      : 0)
  );
}

function normalizedAddress(value: CanonicalCampgroundRecord) {
  const address = value.address.trim().toLowerCase();
  if (PLACEHOLDER_ADDRESSES.has(address)) return null;
  const normalized = `${address} ${value.city} ${value.region} ${value.country}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(
      /\b(road|street|avenue|highway|route)\b/g,
      (word) =>
        ({
          road: "rd",
          street: "st",
          avenue: "ave",
          highway: "hwy",
          route: "rte",
        })[word] || word,
    )
    .replace(/[^a-z0-9]+/g, "");
  return normalized.length >= 8 ? normalized : null;
}

function haversineMeters(
  left: Pick<CanonicalCampgroundRecord, "latitude" | "longitude">,
  right: Pick<CanonicalCampgroundRecord, "latitude" | "longitude">,
) {
  const radians = Math.PI / 180;
  const dLat = (right.latitude - left.latitude) * radians;
  const dLon = (right.longitude - left.longitude) * radians;
  const lat1 = left.latitude * radians;
  const lat2 = right.latitude * radians;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6_371_008.8 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function regionCompatible(
  left: CanonicalCampgroundRecord,
  right: CanonicalCampgroundRecord,
) {
  const l = left.region.trim().toLowerCase();
  const r = right.region.trim().toLowerCase();
  return !l || !r || l === "unknown" || r === "unknown" || l === r;
}

function distinctFacilityConflict(leftName: string, rightName: string) {
  const tokens = (value: string) =>
    new Set(
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter(Boolean),
    );
  const left = tokens(leftName);
  const right = tokens(rightName);
  const leftQualifiers = [...left].filter((token) =>
    DISTINCT_FACILITY_QUALIFIERS.has(token),
  );
  const rightQualifiers = [...right].filter((token) =>
    DISTINCT_FACILITY_QUALIFIERS.has(token),
  );
  if (
    leftQualifiers.some((token) => !right.has(token)) ||
    rightQualifiers.some((token) => !left.has(token))
  )
    return true;
  if (
    OPPOSING_FACILITY_QUALIFIERS.some(
      ([first, second]) =>
        (left.has(first) && right.has(second)) ||
        (left.has(second) && right.has(first)),
    )
  )
    return true;
  const sharedSubfacilityMarker = [...SHARED_SUBFACILITY_MARKERS].some(
    (token) => left.has(token) && right.has(token),
  );
  if (sharedSubfacilityMarker) {
    const ignored = new Set([
      ...DISTINCT_FACILITY_QUALIFIERS,
      "camp",
      "campground",
      "campgrounds",
    ]);
    const leftSpecific = [...left].filter(
      (token) => !ignored.has(token) && !right.has(token),
    );
    const rightSpecific = [...right].filter(
      (token) => !ignored.has(token) && !left.has(token),
    );
    if (leftSpecific.length && rightSpecific.length) return true;
  }
  const leftNumbers = [...left].filter((token) => /^\d+$/.test(token));
  const rightNumbers = [...right].filter((token) => /^\d+$/.test(token));
  return Boolean(
    leftNumbers.length &&
    rightNumbers.length &&
    (leftNumbers.some((token) => !right.has(token)) ||
      rightNumbers.some((token) => !left.has(token))),
  );
}

function pairKey(
  left: CanonicalCampgroundRecord,
  right: CanonicalCampgroundRecord,
) {
  return left.id < right.id
    ? `${left.id}:${right.id}`
    : `${right.id}:${left.id}`;
}

function scorePair(
  first: CanonicalCampgroundRecord,
  second: CanonicalCampgroundRecord,
  maxDistanceMeters: number,
): CanonicalDuplicateCandidate | null {
  if (first.id === second.id || first.country !== second.country) return null;
  const [left, right] =
    first.id < second.id ? [first, second] : [second, first];
  if (distinctFacilityConflict(left.name, right.name)) return null;
  const distanceMeters = haversineMeters(left, right);
  let nameSimilarity = campgroundNameIdentitySimilarity(left.name, right.name);
  const leftWebsite = campgroundWebsiteIdentity(left.website);
  const rightWebsite = campgroundWebsiteIdentity(right.website);
  const websiteMatch = Boolean(leftWebsite && leftWebsite === rightWebsite);
  const genericKoa = (value: string) =>
    /^(?:kampgrounds? of america|koa(?: campground)?)$/i.test(value.trim());
  const namedKoa = (value: string) => /\bkoa\b/i.test(value);
  if (
    websiteMatch &&
    ((genericKoa(left.name) && namedKoa(right.name)) ||
      (genericKoa(right.name) && namedKoa(left.name)))
  )
    nameSimilarity = Math.max(nameSimilarity, 0.98);
  const leftPhone = normalizePhone(left.phone);
  const rightPhone = normalizePhone(right.phone);
  const phoneMatch = Boolean(leftPhone && leftPhone === rightPhone);
  const leftAddress = normalizedAddress(left);
  const rightAddress = normalizedAddress(right);
  const addressMatch = Boolean(leftAddress && leftAddress === rightAddress);
  const nearby = distanceMeters <= maxDistanceMeters;
  const hasIdentityEvidence = websiteMatch || phoneMatch || addressMatch;

  if (
    !(nearby && nameSimilarity >= 0.78) &&
    !(websiteMatch && nameSimilarity >= 0.5) &&
    !(addressMatch && nameSimilarity >= 0.5) &&
    !(phoneMatch && nameSimilarity >= 0.85)
  )
    return null;

  let score = nameSimilarity * 0.55;
  const reasons: string[] = [];
  if (websiteMatch) {
    score += 0.45;
    reasons.push("same website page");
  }
  if (addressMatch) {
    score += 0.35;
    reasons.push("same normalized address");
  }
  if (phoneMatch) {
    score += 0.3;
    reasons.push("same phone number");
  }
  if (distanceMeters <= 75) {
    score += 0.35;
    reasons.push("coordinates within 75 metres");
  } else if (distanceMeters <= 350) {
    score += 0.25;
    reasons.push("coordinates within 350 metres");
  } else if (distanceMeters <= 1_000) {
    score += 0.14;
    reasons.push("coordinates within 1 kilometre");
  } else if (distanceMeters <= maxDistanceMeters) {
    score += 0.08;
    reasons.push(
      `coordinates within ${Math.round(maxDistanceMeters / 1_000)} kilometres`,
    );
  }
  if (!regionCompatible(left, right) && !hasIdentityEvidence) score -= 0.25;
  if (nameSimilarity >= 0.95) reasons.push("equivalent campground name");
  else reasons.push("strong campground name overlap");
  score = Math.max(0, Math.min(1, score));
  if (score < 0.62) return null;
  const closeEquivalentName = distanceMeters <= 150 && nameSimilarity >= 0.9;
  if (score < 0.7 && !hasIdentityEvidence && !closeEquivalentName) return null;

  const exactEvidenceCount = [websiteMatch, phoneMatch, addressMatch].filter(
    Boolean,
  ).length;
  const automatic =
    (distanceMeters <= 75 && nameSimilarity >= 0.96) ||
    (websiteMatch && nameSimilarity >= 0.8) ||
    (addressMatch && nameSimilarity >= 0.9) ||
    (exactEvidenceCount >= 2 && nameSimilarity >= 0.6);
  return {
    left,
    right,
    country: left.country,
    region: regionCompatible(left, right)
      ? left.region
      : `${left.region} / ${right.region}`,
    distanceMeters,
    nameIdentitySimilarity: nameSimilarity,
    matchScore: score,
    websiteMatch,
    phoneMatch,
    addressMatch,
    reasons,
    recommendation: automatic ? "automatic" : "review",
    suggestedSurvivorId:
      canonicalQuality(left) >= canonicalQuality(right) ? left.id : right.id,
  };
}

function addCandidate(
  candidates: Map<string, CanonicalDuplicateCandidate>,
  left: CanonicalCampgroundRecord,
  right: CanonicalCampgroundRecord,
  maxDistanceMeters: number,
) {
  const candidate = scorePair(left, right, maxDistanceMeters);
  if (!candidate) return;
  const key = pairKey(left, right);
  const existing = candidates.get(key);
  if (!existing || candidate.matchScore > existing.matchScore)
    candidates.set(key, candidate);
}

function addIdentityBucketPairs(
  buckets: Map<string, CanonicalCampgroundRecord[]>,
  candidates: Map<string, CanonicalDuplicateCandidate>,
  maxDistanceMeters: number,
) {
  for (const values of buckets.values()) {
    if (values.length < 2 || values.length > MAX_IDENTITY_BUCKET_SIZE) continue;
    for (let left = 0; left < values.length - 1; left++)
      for (let right = left + 1; right < values.length; right++)
        addCandidate(
          candidates,
          values[left],
          values[right],
          maxDistanceMeters,
        );
  }
}

function addToBucket(
  buckets: Map<string, CanonicalCampgroundRecord[]>,
  key: string | null,
  value: CanonicalCampgroundRecord,
) {
  if (!key) return;
  const values = buckets.get(key);
  if (values) values.push(value);
  else buckets.set(key, [value]);
}

export function detectCanonicalDuplicateCandidates(
  records: CanonicalCampgroundRecord[],
  { maxDistanceMeters = DEFAULT_MAX_DISTANCE_METERS } = {},
) {
  const candidates = new Map<string, CanonicalDuplicateCandidate>();
  const grid = new Map<string, CanonicalCampgroundRecord[]>();
  const websiteBuckets = new Map<string, CanonicalCampgroundRecord[]>();
  const phoneBuckets = new Map<string, CanonicalCampgroundRecord[]>();
  const addressBuckets = new Map<string, CanonicalCampgroundRecord[]>();
  const latitudeCells = Math.max(
    1,
    Math.ceil(maxDistanceMeters / (111_320 * GRID_DEGREES)),
  );

  for (const record of records) {
    const latCell = Math.floor(record.latitude / GRID_DEGREES);
    const lonCell = Math.floor(record.longitude / GRID_DEGREES);
    const longitudeCells = Math.max(
      1,
      Math.min(
        8,
        Math.ceil(
          maxDistanceMeters /
            (111_320 *
              Math.max(0.15, Math.cos((record.latitude * Math.PI) / 180)) *
              GRID_DEGREES),
        ),
      ),
    );
    for (let y = -latitudeCells; y <= latitudeCells; y++)
      for (let x = -longitudeCells; x <= longitudeCells; x++) {
        const nearby = grid.get(
          `${record.country}:${latCell + y}:${lonCell + x}`,
        );
        if (!nearby) continue;
        for (const other of nearby)
          addCandidate(candidates, other, record, maxDistanceMeters);
      }
    const gridKey = `${record.country}:${latCell}:${lonCell}`;
    const cell = grid.get(gridKey);
    if (cell) cell.push(record);
    else grid.set(gridKey, [record]);

    addToBucket(
      websiteBuckets,
      campgroundWebsiteIdentity(record.website),
      record,
    );
    addToBucket(phoneBuckets, normalizePhone(record.phone), record);
    addToBucket(addressBuckets, normalizedAddress(record), record);
  }

  addIdentityBucketPairs(websiteBuckets, candidates, maxDistanceMeters);
  addIdentityBucketPairs(phoneBuckets, candidates, maxDistanceMeters);
  addIdentityBucketPairs(addressBuckets, candidates, maxDistanceMeters);
  return [...candidates.values()].sort(
    (left, right) =>
      right.matchScore - left.matchScore ||
      (left.distanceMeters ?? Infinity) - (right.distanceMeters ?? Infinity),
  );
}

async function loadCanonicalCampgrounds({
  country,
  region,
}: {
  country?: string;
  region?: string;
}) {
  const { sqlClient } = await import("@/db");
  const rows = await sqlClient<
    Array<{
      id: string;
      name: string;
      slug: string;
      verification: string;
      source_priority: number;
      source_count: number;
      report_count: number;
      country: string;
      region: string;
      city: string;
      address: string;
      website: string | null;
      phone: string | null;
      latitude: number;
      longitude: number;
    }>
  >`
    WITH source_stats AS (
      SELECT campground_id, max(source_priority)::int AS source_priority,
        count(*)::int AS source_count
      FROM location_source_records
      WHERE campground_id IS NOT NULL
      GROUP BY campground_id
    ), report_stats AS (
      SELECT campground_id, count(*)::int AS report_count
      FROM reports WHERE deleted_at IS NULL GROUP BY campground_id
    )
    SELECT c.id, c.name, c.slug, c.verification_status AS verification,
      coalesce(s.source_priority, 0)::int AS source_priority,
      coalesce(s.source_count, 0)::int AS source_count,
      coalesce(r.report_count, 0)::int AS report_count,
      c.country, c.region, c.city, c.address, c.website, c.phone,
      c.latitude, c.longitude
    FROM campgrounds c
    LEFT JOIN source_stats s ON s.campground_id = c.id
    LEFT JOIN report_stats r ON r.campground_id = c.id
    WHERE c.active = true
      AND (${country || null}::text IS NULL OR c.country = ${country || null})
      AND (${region || null}::text IS NULL OR c.region = ${region || null})
    ORDER BY c.id
  `;
  return rows.map((row): CanonicalCampgroundRecord => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    verification: row.verification,
    sourcePriority: Number(row.source_priority),
    sourceCount: Number(row.source_count),
    reportCount: Number(row.report_count),
    country: row.country,
    region: row.region,
    city: row.city,
    address: row.address,
    website: row.website,
    phone: row.phone,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
  }));
}

async function persistCandidates(candidates: CanonicalDuplicateCandidate[]) {
  const { sqlClient } = await import("@/db");
  let persisted = 0;
  for (let offset = 0; offset < candidates.length; offset += 250) {
    const batch = candidates.slice(offset, offset + 250).map((candidate) => ({
      left_campground_id: candidate.left.id,
      right_campground_id: candidate.right.id,
      suggested_survivor_id: candidate.suggestedSurvivorId,
      match_score: candidate.matchScore,
      recommendation: candidate.recommendation,
      reasons: candidate.reasons,
      distance_meters: candidate.distanceMeters,
      name_similarity: candidate.nameIdentitySimilarity,
      website_match: candidate.websiteMatch,
      phone_match: candidate.phoneMatch,
      address_match: candidate.addressMatch,
    }));
    const rows = await sqlClient<{ id: string }[]>`
      INSERT INTO canonical_duplicate_candidates AS existing (
        left_campground_id, right_campground_id, suggested_survivor_id,
        match_score, recommendation, reasons, distance_meters,
        name_similarity, website_match, phone_match, address_match,
        last_detected_at, updated_at
      )
      SELECT x.left_campground_id::uuid, x.right_campground_id::uuid,
        x.suggested_survivor_id::uuid, x.match_score, x.recommendation,
        x.reasons, x.distance_meters, x.name_similarity, x.website_match,
        x.phone_match, x.address_match, now(), now()
      FROM jsonb_to_recordset(${toPostgresJson(batch)}::jsonb) AS x(
        left_campground_id text, right_campground_id text,
        suggested_survivor_id text, match_score real, recommendation text,
        reasons jsonb, distance_meters real, name_similarity real,
        website_match boolean, phone_match boolean, address_match boolean
      )
      ON CONFLICT (left_campground_id, right_campground_id) DO UPDATE SET
        suggested_survivor_id = excluded.suggested_survivor_id,
        match_score = excluded.match_score,
        recommendation = excluded.recommendation,
        reasons = excluded.reasons,
        distance_meters = excluded.distance_meters,
        name_similarity = excluded.name_similarity,
        website_match = excluded.website_match,
        phone_match = excluded.phone_match,
        address_match = excluded.address_match,
        last_detected_at = now(), updated_at = now()
      WHERE existing.status = 'pending'
      RETURNING id
    `;
    persisted += rows.length;
  }
  return persisted;
}

async function removeStalePendingCandidates({
  scanStartedAt,
  country,
  region,
}: {
  scanStartedAt: string;
  country?: string;
  region?: string;
}) {
  const { sqlClient } = await import("@/db");
  const removed = await sqlClient<{ id: string }[]>`
    DELETE FROM canonical_duplicate_candidates candidate
    USING campgrounds left_campground, campgrounds right_campground
    WHERE candidate.status = 'pending'
      AND candidate.last_detected_at < ${scanStartedAt}::timestamptz
      AND left_campground.id = candidate.left_campground_id
      AND right_campground.id = candidate.right_campground_id
      AND (${country || null}::text IS NULL OR (
        left_campground.country = ${country || null}
        AND right_campground.country = ${country || null}
      ))
      AND (${region || null}::text IS NULL OR (
        left_campground.region = ${region || null}
        AND right_campground.region = ${region || null}
      ))
    RETURNING candidate.id
  `;
  return removed.length;
}

export async function scanCanonicalDuplicates({
  maxDistanceMeters = DEFAULT_MAX_DISTANCE_METERS,
  country,
  region,
  persist = true,
}: {
  maxDistanceMeters?: number;
  country?: string;
  region?: string;
  persist?: boolean;
} = {}) {
  let scanStartedAt: string | null = null;
  if (persist) {
    const { sqlClient } = await import("@/db");
    const rows = await sqlClient<{ scan_started_at: string }[]>`
      SELECT clock_timestamp()::text AS scan_started_at
    `;
    scanStartedAt = rows[0].scan_started_at;
  }
  const records = await loadCanonicalCampgrounds({ country, region });
  const candidates = detectCanonicalDuplicateCandidates(records, {
    maxDistanceMeters,
  });
  const persisted = persist ? await persistCandidates(candidates) : 0;
  const staleRemoved =
    persist && scanStartedAt
      ? await removeStalePendingCandidates({
          scanStartedAt,
          country,
          region,
        })
      : 0;
  return {
    scanned: records.length,
    detected: candidates.length,
    automatic: candidates.filter(
      (candidate) => candidate.recommendation === "automatic",
    ).length,
    review: candidates.filter(
      (candidate) => candidate.recommendation === "review",
    ).length,
    persisted,
    staleRemoved,
    clusters: summarizeDuplicateCandidateClusters(candidates),
    candidates,
  };
}

export async function findCanonicalDuplicateCandidates({
  maxDistanceMeters = DEFAULT_MAX_DISTANCE_METERS,
  limit = 1_000,
  country,
  region,
}: {
  maxDistanceMeters?: number;
  limit?: number;
  country?: string;
  region?: string;
} = {}) {
  const result = await scanCanonicalDuplicates({
    maxDistanceMeters,
    country,
    region,
    persist: false,
  });
  return result.candidates.slice(0, limit);
}
