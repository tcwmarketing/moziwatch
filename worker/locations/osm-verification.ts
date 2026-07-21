import { toPostgresJson } from "@/lib/postgres-json";

export const OSM_PUBLICATION_RULE_VERSION = "osm-established-campground-v1";

export type OsmPublicationEvidence = {
  name: string;
  locationType: string;
  operator: string | null;
  website: string | null;
  phone: string | null;
  address: string | null;
  campsiteCount: number | null;
  independentSourceCount: number;
};

const EXCLUDED_NAME =
  /\b(bible|church|youth|scout|girl\s+guide|ymca|school|retreat|conference|ranger\s+station|visitor\s+cent(?:er|re)|trailhead|picnic|day[- ]use|mobile\s*home|rv\s+dealer|love'?s\s+rv|store)\b/i;
const EXPLICIT_CAMPGROUND =
  /\b(camp\s*ground|camping\s+(?:area|park|resort|ground)|rv\s+(?:park|resort|campground)|koa)\b/i;

export function osmPublicationDecision(evidence: OsmPublicationEvidence) {
  if (!["developed_campground", "rv_park"].includes(evidence.locationType))
    return { publish: false, reason: "unsupported_type" } as const;
  if (EXCLUDED_NAME.test(evidence.name))
    return { publish: false, reason: "excluded_name" } as const;
  const establishmentSignals = [
    evidence.operator,
    evidence.website,
    evidence.phone,
    evidence.address && evidence.address !== "Address not provided"
      ? evidence.address
      : null,
    evidence.campsiteCount,
  ].filter(Boolean).length;
  const supported =
    evidence.independentSourceCount >= 2 ||
    establishmentSignals >= 2 ||
    (EXPLICIT_CAMPGROUND.test(evidence.name) && establishmentSignals >= 1);
  return supported
    ? ({ publish: true, reason: "established_campground_evidence" } as const)
    : ({ publish: false, reason: "insufficient_evidence" } as const);
}

export async function verifyEstablishedOsmCampgrounds({ apply = false } = {}) {
  const { sqlClient } = await import("@/db");
  const rows = await sqlClient<
    Array<OsmPublicationEvidence & { id: string; verification: string }>
  >`
    SELECT c.id, c.name, c.location_type AS "locationType",
      c.operator, c.website, c.phone, c.address,
      max(lsr.campsite_count)::int AS "campsiteCount",
      count(DISTINCT lsr.source)::int AS "independentSourceCount",
      c.verification_status AS verification
    FROM campgrounds c
    JOIN location_source_records osm ON osm.campground_id = c.id
      AND osm.source = 'openstreetmap' AND osm.import_status = 'accepted'
    JOIN location_source_records lsr ON lsr.campground_id = c.id
      AND lsr.import_status = 'accepted'
    WHERE c.active = true AND c.operational_status <> 'closed'
      AND c.country IN ('CA', 'US')
    GROUP BY c.id
  `;
  const eligible = rows.filter(
    (row) =>
      row.verification === "unverified" && osmPublicationDecision(row).publish,
  );
  const publishIds: string[] = [];
  for (const row of eligible) {
    const duplicates = await sqlClient<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM campgrounds other
        WHERE other.id <> ${row.id}::uuid AND other.active = true
          AND other.verification_status <> 'unverified'
          AND extensions.st_dwithin(
            other.point::geography,
            (SELECT point::geography FROM campgrounds WHERE id = ${row.id}::uuid),
            500
          )
          AND extensions.similarity(other.normalized_name,
            (SELECT normalized_name FROM campgrounds WHERE id = ${row.id}::uuid)
          ) >= 0.75
      ) AS exists
    `;
    if (!duplicates[0]?.exists) publishIds.push(row.id);
  }
  let published = 0;
  if (apply && publishIds.length) {
    const changed = await sqlClient<{ count: number }[]>`
      WITH input AS (
        SELECT value::uuid AS id
        FROM jsonb_array_elements_text(${toPostgresJson(publishIds)}::jsonb)
      ), changed AS (
        UPDATE campgrounds c SET verification_status = 'source_verified',
          field_provenance = c.field_provenance || jsonb_build_object(
            'verification', jsonb_build_array(${OSM_PUBLICATION_RULE_VERSION}, 70)
          ), updated_at = now()
        FROM input WHERE c.id = input.id AND c.verification_status = 'unverified'
        RETURNING c.id
      ) SELECT count(*)::int AS count FROM changed
    `;
    published = Number(changed[0]?.count || 0);
  }
  return {
    apply,
    examined: rows.length,
    eligible: eligible.length,
    publishable: publishIds.length,
    published,
  };
}
