import { toPostgresJson } from "@/lib/postgres-json";
import {
  canonicalQuality,
  detectCanonicalDuplicateCandidates,
  type CanonicalCampgroundRecord,
} from "./duplicate-audit";

export const OVERTURE_PUBLICATION_RULE_VERSION =
  "overture-established-campground-v2";

export type OverturePublicationEvidence = {
  name: string;
  confidence: number | null;
  website: string | null;
  primaryCategory: string | null;
  operatingStatus: string | null;
};

export type OverturePublicationDecision = {
  publish: boolean;
  reason:
    | "eligible_explicit_established_campground"
    | "eligible_web_supported_camping_facility"
    | "not_primary_campground"
    | "closed"
    | "excluded_name"
    | "insufficient_name_evidence"
    | "insufficient_confidence";
};

const EXPLICIT_ESTABLISHED_CAMPGROUND =
  /\b(camp\s*ground|camping(?:\s+(?:area|park|resort|ground))?|rv\s+(?:campground|park|resort)|camper\s+park|koa(?:\s+(?:journey|holiday|resort))?|kampgrounds?\s+of\s+america)\b/i;
const WEB_SUPPORTED_RV_NAME = /\brv(?:s|\s|$)|recreational\s+vehicle/i;
const CAMPING_WEBSITE =
  /(?:camp(?:ground|ing|site)|rv[-_/ ]?(?:park|resort|hookup)|koa\.com\/campgrounds)/i;
const EXCLUDED_NAME =
  /\b(bible|church|youth|scout|girl\s+guide|ymca|leadership|easter\s+seal|school|swim|retreat|conference|convention|wedding|ranger\s+station|public\s+service\s+cent(?:er|re)|visitor\s+cent(?:er|re)|welcome\s+cent(?:er|re)|trailhead|picnic|day[- ]use|boat\s+(?:launch|ramp)|dump\s+station|mobile\s*home|manufactured\s+home|residential\s+(?:community|park)|rv\s+(?:dealer|hookups?)|love'?s\s+rv|camping\s+store|outdoor\s+store|trading\s+post|trade\s+days|firewood|repair\s+shop)\b/i;

export function overturePublicationDecision(
  evidence: OverturePublicationEvidence,
): OverturePublicationDecision {
  if (evidence.primaryCategory !== "campground")
    return { publish: false, reason: "not_primary_campground" };
  if (evidence.operatingStatus === "permanently_closed")
    return { publish: false, reason: "closed" };
  if (EXCLUDED_NAME.test(evidence.name))
    return { publish: false, reason: "excluded_name" };
  const explicitName = EXPLICIT_ESTABLISHED_CAMPGROUND.test(evidence.name);
  const webSupportedFacility = Boolean(
    evidence.website &&
    WEB_SUPPORTED_RV_NAME.test(evidence.name) &&
    CAMPING_WEBSITE.test(evidence.website),
  );
  if (!explicitName && !webSupportedFacility)
    return { publish: false, reason: "insufficient_name_evidence" };
  const confidence = evidence.confidence ?? 0;
  const threshold = webSupportedFacility ? 0.9 : evidence.website ? 0.8 : 0.95;
  if (!Number.isFinite(confidence) || confidence < threshold)
    return { publish: false, reason: "insufficient_confidence" };
  return webSupportedFacility && !explicitName
    ? { publish: true, reason: "eligible_web_supported_camping_facility" }
    : {
        publish: true,
        reason: "eligible_explicit_established_campground",
      };
}

type CandidateRow = {
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
  confidence: number | null;
  primary_category: string | null;
  operating_status: string | null;
};

function canonicalRecord(row: CandidateRow): CanonicalCampgroundRecord {
  return {
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
  };
}

async function loadCandidates() {
  const { sqlClient } = await import("@/db");
  return sqlClient<CandidateRow[]>`
    WITH source_stats AS (
      SELECT campground_id, max(source_priority)::int AS source_priority,
        count(*)::int AS source_count
      FROM location_source_records
      WHERE campground_id IS NOT NULL
      GROUP BY campground_id
    ), report_stats AS (
      SELECT campground_id, count(*)::int AS report_count
      FROM reports WHERE deleted_at IS NULL GROUP BY campground_id
    ), overture AS (
      SELECT DISTINCT ON (campground_id)
        campground_id,
        nullif(raw_payload->>'confidence', '')::double precision AS confidence,
        raw_payload->>'primary_category' AS primary_category,
        raw_payload->>'operating_status' AS operating_status
      FROM location_source_records
      WHERE source IN ('overture-ca', 'overture-us')
        AND campground_id IS NOT NULL
        AND import_status = 'accepted'
      ORDER BY campground_id,
        nullif(raw_payload->>'confidence', '')::double precision DESC NULLS LAST,
        updated_at DESC
    )
    SELECT c.id, c.name, c.slug,
      c.verification_status AS verification,
      coalesce(s.source_priority, 0)::int AS source_priority,
      coalesce(s.source_count, 0)::int AS source_count,
      coalesce(r.report_count, 0)::int AS report_count,
      c.country, c.region, c.city, c.address, c.website, c.phone,
      c.latitude, c.longitude, o.confidence, o.primary_category,
      o.operating_status
    FROM campgrounds c
    JOIN overture o ON o.campground_id = c.id
    LEFT JOIN source_stats s ON s.campground_id = c.id
    LEFT JOIN report_stats r ON r.campground_id = c.id
    WHERE c.active = true AND c.country IN ('CA', 'US')
    ORDER BY c.id
  `;
}

export async function verifyEstablishedOvertureCampgrounds({
  apply = false,
  country,
  region,
}: {
  apply?: boolean;
  country?: string;
  region?: string;
} = {}) {
  const rows = await loadCandidates();
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const decisions = new Map(
    rows.map((row) => [
      row.id,
      overturePublicationDecision({
        name: row.name,
        confidence: row.confidence,
        website: row.website,
        primaryCategory: row.primary_category,
        operatingStatus: row.operating_status,
      }),
    ]),
  );
  const eligible = new Set(
    rows
      .filter(
        (row) =>
          row.verification === "unverified" &&
          (!country || row.country === country) &&
          (!region || row.region === region) &&
          decisions.get(row.id)?.publish,
      )
      .map((row) => row.id),
  );

  const records = rows.map(canonicalRecord);
  const byId = new Map(records.map((record) => [record.id, record]));
  const automaticDuplicates = detectCanonicalDuplicateCandidates(records)
    .filter(
      (candidate) =>
        candidate.recommendation === "automatic" ||
        (candidate.nameIdentitySimilarity >= 0.97 &&
          (candidate.distanceMeters ?? Infinity) <= 500),
    )
    .filter(
      (candidate) =>
        eligible.has(candidate.left.id) || eligible.has(candidate.right.id),
    );
  const duplicateBlocked = new Set<string>();
  for (const candidate of automaticDuplicates) {
    const leftEligible = eligible.has(candidate.left.id);
    const rightEligible = eligible.has(candidate.right.id);
    if (leftEligible && rightEligible) {
      const leftQuality = canonicalQuality(candidate.left);
      const rightQuality = canonicalQuality(candidate.right);
      duplicateBlocked.add(
        leftQuality > rightQuality
          ? candidate.right.id
          : rightQuality > leftQuality
            ? candidate.left.id
            : candidate.left.id < candidate.right.id
              ? candidate.right.id
              : candidate.left.id,
      );
    } else {
      const eligibleId = leftEligible ? candidate.left.id : candidate.right.id;
      const other = byId.get(
        leftEligible ? candidate.right.id : candidate.left.id,
      );
      if (other?.verification !== "unverified")
        duplicateBlocked.add(eligibleId);
    }
  }

  const publishIds = [...eligible].filter((id) => !duplicateBlocked.has(id));
  let published = 0;
  if (apply) {
    const { sqlClient } = await import("@/db");
    for (let offset = 0; offset < publishIds.length; offset += 500) {
      const batch = publishIds.slice(offset, offset + 500);
      const changed = await sqlClient<{ updated: number }[]>`
        WITH input AS (
          SELECT value::uuid AS id
          FROM jsonb_array_elements_text(${toPostgresJson(batch)}::jsonb)
        ), updated AS (
          UPDATE campgrounds c SET
            verification_status = 'source_verified',
            field_provenance = c.field_provenance || jsonb_build_object(
              'verification',
              jsonb_build_array(${OVERTURE_PUBLICATION_RULE_VERSION}::text, 70)
            ),
            updated_at = now()
          FROM input
          WHERE c.id = input.id AND c.verification_status = 'unverified'
          RETURNING c.id
        )
        SELECT count(*)::int AS updated FROM updated
      `;
      published += changed[0]?.updated ?? 0;
    }
  }

  const reasonCounts = Object.fromEntries(
    [...decisions.values()].reduce((counts, decision) => {
      counts.set(decision.reason, (counts.get(decision.reason) ?? 0) + 1);
      return counts;
    }, new Map<string, number>()),
  );
  const samples = publishIds.slice(0, 20).map((id) => {
    const row = rowById.get(id)!;
    return {
      id,
      name: row.name,
      country: row.country,
      region: row.region,
      confidence: row.confidence,
    };
  });
  const jurisdictionCounts = [...publishIds].reduce((counts, id) => {
    const row = rowById.get(id)!;
    const key = `${row.country}-${row.region}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const publishableByJurisdiction = Object.fromEntries(
    [...jurisdictionCounts.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
  return {
    apply,
    scope: { country: country ?? null, region: region ?? null },
    rule: OVERTURE_PUBLICATION_RULE_VERSION,
    examined: rows.length,
    eligible: eligible.size,
    duplicateBlocked: duplicateBlocked.size,
    publishable: publishIds.length,
    published,
    publishableByJurisdiction,
    reasonCounts,
    samples,
  };
}
