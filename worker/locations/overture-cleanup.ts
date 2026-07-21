import { createHash } from "node:crypto";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import {
  compactOvertureRawPayload,
  OVERTURE_RETENTION_RULE_VERSION,
  overtureRetentionReason,
  type OvertureRetentionReason,
} from "./overture-retention";

type SourceCandidate = {
  id: string;
  campground_id: string;
  source: "overture-ca" | "overture-us";
  external_id: string;
  source_release: string | null;
  checksum: string;
  raw_payload: Record<string, unknown>;
  normalized_payload: Record<string, unknown>;
  campground_name: string;
  normalized_name: string;
  country: string;
  region: string;
  latitude: number;
  longitude: number;
  protected_by_user_data: boolean;
};

type CleanupCandidate = SourceCandidate & {
  reason: OvertureRetentionReason;
  confidence: number | null;
  primaryCategory: string | null;
};

const batch = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  );

function sourceEvidence(record: SourceCandidate) {
  const confidenceValue = Number(record.raw_payload.confidence);
  const confidence = Number.isFinite(confidenceValue) ? confidenceValue : null;
  const primaryCategory =
    typeof record.raw_payload.primary_category === "string"
      ? record.raw_payload.primary_category
      : null;
  const name =
    typeof record.normalized_payload.name === "string"
      ? record.normalized_payload.name
      : record.campground_name;
  return { name, confidence, primaryCategory };
}

async function tableMetrics() {
  const rows = await sqlClient<
    Array<{
      active_campgrounds: number;
      unverified_campgrounds: number;
      source_records: number;
      tombstones: number;
      campground_table_size: string;
      source_table_size: string;
      tombstone_table_size: string;
    }>
  >`
    SELECT
      (SELECT count(*)::int FROM campgrounds WHERE active) AS active_campgrounds,
      (SELECT count(*)::int FROM campgrounds
        WHERE active AND verification_status = 'unverified') AS unverified_campgrounds,
      (SELECT count(*)::int FROM location_source_records) AS source_records,
      (SELECT count(*)::int FROM location_source_tombstones) AS tombstones,
      pg_size_pretty(pg_total_relation_size('campgrounds')) AS campground_table_size,
      pg_size_pretty(pg_total_relation_size('location_source_records')) AS source_table_size,
      pg_size_pretty(pg_total_relation_size('location_source_tombstones')) AS tombstone_table_size
  `;
  return rows[0];
}

async function loadCandidates() {
  return sqlClient<SourceCandidate[]>`
    SELECT source_record.id, source_record.campground_id,
      source_record.source, source_record.external_id,
      source_record.source_release, source_record.checksum,
      source_record.raw_payload, source_record.normalized_payload,
      campground.name AS campground_name,
      campground.normalized_name, campground.country, campground.region,
      campground.latitude, campground.longitude,
      (
        EXISTS (SELECT 1 FROM reports WHERE campground_id = campground.id)
        OR EXISTS (SELECT 1 FROM saved_campgrounds WHERE campground_id = campground.id)
      ) AS protected_by_user_data
    FROM location_source_records source_record
    JOIN campgrounds campground ON campground.id = source_record.campground_id
    WHERE source_record.source IN ('overture-ca', 'overture-us')
      AND source_record.import_status = 'accepted'
      AND campground.active = true
      AND campground.verification_status = 'unverified'
      AND NOT EXISTS (
        SELECT 1 FROM location_source_records corroborating
        WHERE corroborating.campground_id = campground.id
          AND corroborating.import_status = 'accepted'
          AND corroborating.source NOT IN ('overture-ca', 'overture-us')
      )
    ORDER BY source_record.id
  `;
}

async function removeBatch(records: CleanupCandidate[]) {
  const input = records.map((record) => ({
    sourceRecordId: record.id,
    reason: record.reason,
    confidence: record.confidence,
    primaryCategory: record.primaryCategory,
  }));
  return sqlClient.begin(async (tx) => {
    await tx`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${toPostgresJson(input)}::jsonb) AS x(
          "sourceRecordId" uuid, reason text, confidence real,
          "primaryCategory" text
        )
      )
      INSERT INTO location_source_tombstones (
        source, external_id, reason_code, rule_version, name, normalized_name,
        country, region, latitude, longitude, source_confidence,
        primary_category, source_release, source_checksum,
        first_rejected_at, last_rejected_at
      )
      SELECT source_record.source, source_record.external_id, input.reason,
        ${OVERTURE_RETENTION_RULE_VERSION}, campground.name,
        campground.normalized_name, campground.country, campground.region,
        campground.latitude, campground.longitude, input.confidence,
        input."primaryCategory", source_record.source_release,
        source_record.checksum, now(), now()
      FROM input
      JOIN location_source_records source_record
        ON source_record.id = input."sourceRecordId"
      JOIN campgrounds campground ON campground.id = source_record.campground_id
      WHERE NOT EXISTS (
          SELECT 1 FROM reports WHERE campground_id = campground.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM saved_campgrounds WHERE campground_id = campground.id
        )
      ON CONFLICT (source, external_id) DO UPDATE SET
        reason_code = excluded.reason_code,
        rule_version = excluded.rule_version,
        name = excluded.name,
        normalized_name = excluded.normalized_name,
        country = excluded.country,
        region = excluded.region,
        latitude = excluded.latitude,
        longitude = excluded.longitude,
        source_confidence = excluded.source_confidence,
        primary_category = excluded.primary_category,
        source_release = excluded.source_release,
        source_checksum = excluded.source_checksum,
        last_rejected_at = now()
    `;

    const removedSources = await tx<Array<{ campground_id: string }>>`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${toPostgresJson(input)}::jsonb)
          AS x("sourceRecordId" uuid, reason text, confidence real,
            "primaryCategory" text)
      )
      DELETE FROM location_source_records source_record
      USING input, campgrounds campground
      WHERE source_record.id = input."sourceRecordId"
        AND campground.id = source_record.campground_id
        AND NOT EXISTS (
          SELECT 1 FROM reports WHERE campground_id = campground.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM saved_campgrounds WHERE campground_id = campground.id
        )
      RETURNING source_record.campground_id
    `;
    const campgroundIds = [
      ...new Set(removedSources.map((row) => row.campground_id)),
    ];
    if (!campgroundIds.length)
      return { removedSources: 0, removedCampgrounds: 0 };

    await tx`
      DELETE FROM campground_aggregates aggregate
      WHERE aggregate.campground_id = ANY(${campgroundIds}::uuid[])
        AND NOT EXISTS (
          SELECT 1 FROM location_source_records remaining
          WHERE remaining.campground_id = aggregate.campground_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM reports WHERE campground_id = aggregate.campground_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM saved_campgrounds
          WHERE campground_id = aggregate.campground_id
        )
    `;
    const removedCampgrounds = await tx<Array<{ id: string }>>`
      DELETE FROM campgrounds campground
      WHERE campground.id = ANY(${campgroundIds}::uuid[])
        AND campground.verification_status = 'unverified'
        AND NOT EXISTS (
          SELECT 1 FROM location_source_records remaining
          WHERE remaining.campground_id = campground.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM reports WHERE campground_id = campground.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM saved_campgrounds WHERE campground_id = campground.id
        )
      RETURNING campground.id
    `;
    return {
      removedSources: removedSources.length,
      removedCampgrounds: removedCampgrounds.length,
    };
  });
}

async function compactRetainedSources(batchSize: number) {
  const records = await sqlClient<
    Array<{ id: string; raw_payload: Record<string, unknown> }>
  >`
    SELECT id, raw_payload FROM location_source_records
    WHERE source IN ('overture-ca', 'overture-us')
      AND import_status = 'accepted'
    ORDER BY id
  `;
  let compacted = 0;
  for (const recordsBatch of batch(records, batchSize)) {
    const updates = recordsBatch.map((record) => {
      const raw = compactOvertureRawPayload(record.raw_payload);
      return {
        id: record.id,
        raw,
        checksum: createHash("sha256")
          .update(JSON.stringify(raw))
          .digest("hex"),
      };
    });
    const changed = await sqlClient<{ id: string }[]>`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${toPostgresJson(updates)}::jsonb)
          AS x(id uuid, raw jsonb, checksum text)
      )
      UPDATE location_source_records source_record SET
        raw_payload = input.raw,
        normalized_payload = jsonb_strip_nulls(source_record.normalized_payload),
        checksum = input.checksum,
        source_record_url = CASE
          WHEN source_record.source_record_url = source_record.source_url
            THEN NULL
          ELSE source_record.source_record_url
        END,
        updated_at = now()
      FROM input
      WHERE source_record.id = input.id
        AND (
          source_record.raw_payload IS DISTINCT FROM input.raw
          OR source_record.normalized_payload IS DISTINCT FROM
            jsonb_strip_nulls(source_record.normalized_payload)
          OR source_record.source_record_url = source_record.source_url
          OR source_record.checksum IS DISTINCT FROM input.checksum
        )
      RETURNING source_record.id
    `;
    compacted += changed.length;
  }
  return compacted;
}

export async function cleanupOvertureLocations({
  apply = false,
  batchSize = 500,
  fullVacuum = false,
}: {
  apply?: boolean;
  batchSize?: number;
  fullVacuum?: boolean;
} = {}) {
  const before = await tableMetrics();
  const sourceRecords = await loadCandidates();
  const candidates: CleanupCandidate[] = [];
  let protectedRecords = 0;
  for (const record of sourceRecords) {
    const evidence = sourceEvidence(record);
    const reason = overtureRetentionReason(evidence);
    if (!reason) continue;
    if (record.protected_by_user_data) {
      protectedRecords++;
      continue;
    }
    candidates.push({ ...record, ...evidence, reason });
  }
  const reasonCounts = Object.fromEntries(
    [...new Set(candidates.map((candidate) => candidate.reason))]
      .sort()
      .map((reason) => [
        reason,
        candidates.filter((candidate) => candidate.reason === reason).length,
      ]),
  );
  const affectedCampgrounds = new Set(
    candidates.map((candidate) => candidate.campground_id),
  ).size;
  if (!apply)
    return {
      apply,
      before,
      scannedSourceRecords: sourceRecords.length,
      removableSourceRecords: candidates.length,
      affectedCampgrounds,
      protectedRecords,
      reasonCounts,
    };

  let removedSources = 0;
  let removedCampgrounds = 0;
  for (const recordsBatch of batch(candidates, batchSize)) {
    const result = await removeBatch(recordsBatch);
    removedSources += result.removedSources;
    removedCampgrounds += result.removedCampgrounds;
  }
  const compactedSourceRecords = await compactRetainedSources(batchSize);
  const vacuumMode = fullVacuum ? "FULL, ANALYZE" : "ANALYZE";
  await sqlClient.unsafe(`VACUUM (${vacuumMode}) campgrounds`);
  await sqlClient.unsafe(`VACUUM (${vacuumMode}) location_source_records`);
  await sqlClient.unsafe("VACUUM (ANALYZE) location_source_tombstones");
  const after = await tableMetrics();
  return {
    apply,
    before,
    after,
    scannedSourceRecords: sourceRecords.length,
    removableSourceRecords: candidates.length,
    affectedCampgrounds,
    protectedRecords,
    reasonCounts,
    removedSources,
    removedCampgrounds,
    compactedSourceRecords,
    fullVacuum,
  };
}
