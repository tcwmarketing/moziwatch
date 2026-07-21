import { toPostgresJson } from "@/lib/postgres-json";
import { normalizeName } from "./types";

export type DeletionAuditSource = {
  source: string;
  authoritative: boolean;
  consecutiveMissingCount: number;
  sourceRecordUrl: string | null;
};

export type DeletionAuditRecord = {
  id: string;
  name: string;
  slug: string;
  locationType: string;
  address: string;
  city: string;
  region: string;
  country: string;
  website: string | null;
  phone: string | null;
  operationalStatus: string;
  verificationStatus: string;
  reportCount: number;
  savedCount: number;
  sources: DeletionAuditSource[];
};

export type LocationDeletionCandidate = {
  campgroundId: string;
  confidence: number;
  reasonCodes: string[];
  reasons: string[];
  evidence: Record<string, unknown>;
};

const PLACEHOLDER_ADDRESSES = new Set([
  "",
  "address not provided",
  "unknown",
  "not available",
]);
const CAMPGROUND_IDENTITY =
  /\b(campground|camping|forest camp|group site|rv park|recreational vehicle park|caravan park|holiday park)\b/i;

function namedLikeCity(record: DeletionAuditRecord) {
  const name = normalizeName(record.name).replace(/^(camp|park)\s+/, "");
  const city = normalizeName(record.city);
  return Boolean(
    city && city !== "unknown" && (name === city || name === `camp ${city}`),
  );
}

export function detectLocationDeletionCandidate(
  record: DeletionAuditRecord,
): LocationDeletionCandidate | null {
  const reasons: string[] = [];
  const reasonCodes: string[] = [];
  let confidence = 0;
  const name = record.name.trim();
  const hasCampgroundIdentity = CAMPGROUND_IDENTITY.test(name);

  if (
    /\b(ranger station|public service cent(?:er|re))\b/i.test(name) &&
    !hasCampgroundIdentity
  ) {
    confidence = 0.99;
    reasonCodes.push("non_campground_service_facility");
    reasons.push(
      "The name identifies a ranger station or public service centre, not a campground.",
    );
  } else if (
    /\b(visitor cent(?:er|re)|welcome cent(?:er|re)|tourist information cent(?:er|re))\b/i.test(
      name,
    )
  ) {
    confidence = 0.97;
    reasonCodes.push("non_campground_visitor_facility");
    reasons.push(
      "The name identifies a visitor or information facility, not a campground.",
    );
  } else if (
    /\b(boat launch|boat ramp|trailhead|picnic area|day[- ]use area|parking lot|rest area|dump station)\b/i.test(
      name,
    ) &&
    !hasCampgroundIdentity
  ) {
    confidence = 0.94;
    reasonCodes.push("non_campground_recreation_feature");
    reasons.push(
      "The name identifies a recreation feature rather than an overnight campground.",
    );
  } else if (
    /\b(cabin|yurt|shelter|pavilion)\s*(?:#|no\.?\s*)?\d+\b/i.test(name) &&
    !hasCampgroundIdentity
  ) {
    confidence = 0.9;
    reasonCodes.push("individual_accommodation_or_facility");
    reasons.push(
      "The record appears to be one individual accommodation or facility, not a campground.",
    );
  }

  const onlyOverture =
    record.sources.length > 0 &&
    record.sources.every((source) => source.source.startsWith("overture-"));
  const hasAddress = !PLACEHOLDER_ADDRESSES.has(record.address.toLowerCase());
  const hasContact = Boolean(record.website || record.phone);
  if (
    confidence === 0 &&
    onlyOverture &&
    !hasAddress &&
    !hasContact &&
    /^camping\s+/i.test(name) &&
    namedLikeCity(record)
  ) {
    confidence = 0.76;
    reasonCodes.push("unverified_generic_overture_location");
    reasons.push(
      "This is an Overture-only generic city camping label with no address, website, or phone.",
    );
  }

  const staleSources =
    record.sources.length > 0 &&
    record.sources.every(
      (source) => !source.authoritative && source.consecutiveMissingCount >= 3,
    );
  if (staleSources) {
    confidence = Math.max(confidence, 0.82);
    reasonCodes.push("missing_from_all_current_sources");
    reasons.push(
      "Every non-authoritative source has omitted this location from at least three consecutive refreshes.",
    );
  }

  if (!reasonCodes.length) return null;
  if (record.reportCount > 0 || record.savedCount > 0) {
    confidence = Math.max(0.5, confidence - 0.15);
    reasonCodes.push("has_user_data");
    reasons.push(
      "The location has user reports or saves, so removal needs additional care.",
    );
  }

  return {
    campgroundId: record.id,
    confidence: Number(confidence.toFixed(3)),
    reasonCodes: [...new Set(reasonCodes)],
    reasons: [...new Set(reasons)],
    evidence: {
      name: record.name,
      slug: record.slug,
      locationType: record.locationType,
      address: record.address,
      city: record.city,
      region: record.region,
      country: record.country,
      website: record.website,
      phone: record.phone,
      verificationStatus: record.verificationStatus,
      reportCount: record.reportCount,
      savedCount: record.savedCount,
      sources: record.sources,
    },
  };
}

async function loadDeletionAuditRecords() {
  const { sqlClient } = await import("@/db");
  const rows = await sqlClient<
    Array<{
      id: string;
      name: string;
      slug: string;
      location_type: string;
      address: string;
      city: string;
      region: string;
      country: string;
      website: string | null;
      phone: string | null;
      operational_status: string;
      verification_status: string;
      report_count: number;
      saved_count: number;
      sources: Array<{
        source: string;
        authoritative: boolean;
        consecutiveMissingCount: number;
        sourceRecordUrl: string | null;
      }> | null;
    }>
  >`
    WITH report_stats AS (
      SELECT campground_id, count(*)::int AS report_count
      FROM reports
      WHERE deleted_at IS NULL
      GROUP BY campground_id
    ), save_stats AS (
      SELECT campground_id, count(*)::int AS saved_count
      FROM saved_campgrounds
      GROUP BY campground_id
    ), source_stats AS (
      SELECT campground_id,
        jsonb_agg(jsonb_build_object(
          'source', source,
          'authoritative', authoritative,
          'consecutiveMissingCount', consecutive_missing_count,
          'sourceRecordUrl', source_record_url
        ) ORDER BY source, external_id) AS sources
      FROM location_source_records
      WHERE campground_id IS NOT NULL
      GROUP BY campground_id
    )
    SELECT c.id, c.name, c.slug, c.location_type, c.address, c.city,
      c.region, c.country, c.website, c.phone, c.operational_status,
      c.verification_status, coalesce(r.report_count, 0)::int AS report_count,
      coalesce(v.saved_count, 0)::int AS saved_count, s.sources
    FROM campgrounds c
    LEFT JOIN report_stats r ON r.campground_id = c.id
    LEFT JOIN save_stats v ON v.campground_id = c.id
    LEFT JOIN source_stats s ON s.campground_id = c.id
    WHERE c.active = true
    ORDER BY c.id
  `;
  return rows.map((row): DeletionAuditRecord => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    locationType: row.location_type,
    address: row.address,
    city: row.city,
    region: row.region,
    country: row.country,
    website: row.website,
    phone: row.phone,
    operationalStatus: row.operational_status,
    verificationStatus: row.verification_status,
    reportCount: Number(row.report_count),
    savedCount: Number(row.saved_count),
    sources: row.sources || [],
  }));
}

async function persistDeletionCandidates(
  candidates: LocationDeletionCandidate[],
) {
  const { sqlClient } = await import("@/db");
  let persisted = 0;
  for (let offset = 0; offset < candidates.length; offset += 500) {
    const batch = candidates.slice(offset, offset + 500).map((candidate) => ({
      campground_id: candidate.campgroundId,
      confidence: candidate.confidence,
      reason_codes: candidate.reasonCodes,
      reasons: candidate.reasons,
      evidence: candidate.evidence,
    }));
    const rows = await sqlClient<{ id: string }[]>`
      INSERT INTO location_deletion_candidates AS existing (
        campground_id, confidence, reason_codes, reasons, evidence,
        last_detected_at, updated_at
      )
      SELECT x.campground_id::uuid, x.confidence, x.reason_codes,
        x.reasons, x.evidence, now(), now()
      FROM jsonb_to_recordset(${toPostgresJson(batch)}::jsonb) AS x(
        campground_id text, confidence real, reason_codes jsonb,
        reasons jsonb, evidence jsonb
      )
      ON CONFLICT (campground_id) DO UPDATE SET
        confidence = excluded.confidence,
        reason_codes = excluded.reason_codes,
        reasons = excluded.reasons,
        evidence = excluded.evidence,
        last_detected_at = now(),
        updated_at = now()
      WHERE existing.status = 'pending'
      RETURNING id
    `;
    persisted += rows.length;
  }
  const campgroundIds = candidates.map((candidate) => candidate.campgroundId);
  const stale = campgroundIds.length
    ? await sqlClient<{ id: string }[]>`
        DELETE FROM location_deletion_candidates
        WHERE status = 'pending'
          AND NOT (campground_id = ANY(${campgroundIds}::uuid[]))
        RETURNING id
      `
    : await sqlClient<{ id: string }[]>`
        DELETE FROM location_deletion_candidates
        WHERE status = 'pending'
        RETURNING id
      `;
  return { persisted, staleRemoved: stale.length };
}

export async function scanLocationDeletionCandidates({
  persist = true,
}: { persist?: boolean } = {}) {
  const records = await loadDeletionAuditRecords();
  const candidates = records
    .map(detectLocationDeletionCandidate)
    .filter((candidate): candidate is LocationDeletionCandidate =>
      Boolean(candidate),
    )
    .sort(
      (left, right) =>
        right.confidence - left.confidence ||
        left.campgroundId.localeCompare(right.campgroundId),
    );
  const persistence = persist
    ? await persistDeletionCandidates(candidates)
    : { persisted: 0, staleRemoved: 0 };
  return {
    scanned: records.length,
    detected: candidates.length,
    ...persistence,
    candidates,
  };
}
