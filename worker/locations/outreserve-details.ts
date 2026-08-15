import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import {
  outreserveDetailEvidence,
  OutreserveClient,
  type OutreservePropertyDetailResponse,
} from "./connectors/outreserve";

type Options = {
  limit?: number;
  batchSize?: number;
  concurrency?: number;
  staleDays?: number;
  allRecords?: boolean;
  client?: OutreserveClient;
};

type SourceRecord = {
  id: string;
  external_id: string;
  outreserve_uuid: string;
};

type DetailResult = {
  id: string;
  provider_status: string | null;
  canonical_status: "active" | "seasonal" | "closed" | "review" | null;
  campsite_count: number | null;
  raw_patch: Record<string, unknown>;
  checked_at: string;
};

export async function backfillOutreserveSearchStatus() {
  const rows = await sqlClient<{ id: string }[]>`
    UPDATE location_source_records SET
      raw_payload = raw_payload || jsonb_build_object(
        'provider_listing_status', 'active',
        'provider_status_basis', 'active_search_inventory'
      ),
      updated_at = now()
    WHERE source = 'outreserve' AND import_status = 'accepted'
      AND (
        raw_payload->>'provider_listing_status' IS DISTINCT FROM 'active'
        OR raw_payload->>'provider_status_basis' IS NULL
      )
    RETURNING id
  `;
  return rows.length;
}

export async function outreserveDetailCoverage() {
  const rows = await sqlClient<
    Array<{
      linked_source_records: number;
      source_records_with_site_count: number;
      campgrounds_with_site_count: number;
      property_details_checked: number;
      active_listing_evidence: number;
      unchecked_likely_inventory_records: number;
    }>
  >`
    SELECT
      count(*)::int AS linked_source_records,
      count(*) FILTER (WHERE source_record.campsite_count IS NOT NULL)::int
        AS source_records_with_site_count,
      count(DISTINCT source_record.campground_id) FILTER (
        WHERE source_record.campsite_count IS NOT NULL
      )::int AS campgrounds_with_site_count,
      count(*) FILTER (
        WHERE source_record.raw_payload->>'provider_status_basis' = 'property_detail'
      )::int AS property_details_checked,
      count(*) FILTER (
        WHERE source_record.raw_payload->>'provider_listing_status' = 'active'
      )::int AS active_listing_evidence,
      count(*) FILTER (
        WHERE source_record.campsite_count_checked_at IS NULL
          AND (
            source_record.raw_payload->>'instant_book' = 'true'
            OR jsonb_array_length(
              coalesce(source_record.raw_payload->'site_types', '[]'::jsonb)
            ) > 0
          )
      )::int AS unchecked_likely_inventory_records
    FROM location_source_records source_record
    WHERE source_record.source = 'outreserve'
      AND source_record.import_status = 'accepted'
      AND source_record.campground_id IS NOT NULL
  `;
  return rows[0];
}

async function persistDetailBatch(results: DetailResult[]) {
  if (!results.length) return;
  await sqlClient.begin(async (tx) => {
    await tx`
      WITH input AS (
        SELECT id::uuid, provider_status, canonical_status,
          campsite_count, raw_patch, checked_at::timestamptz
        FROM jsonb_to_recordset(${toPostgresJson(results)}::jsonb)
          AS x(
            id text,
            provider_status text,
            canonical_status text,
            campsite_count integer,
            raw_patch jsonb,
            checked_at text
          )
      )
      UPDATE location_source_records source_record SET
        raw_payload = source_record.raw_payload || input.raw_patch,
        campsite_count = coalesce(
          input.campsite_count, source_record.campsite_count
        ),
        campsite_count_kind = CASE
          WHEN input.campsite_count IS NOT NULL
            THEN 'reservable_inventory'::campsite_count_kind
          ELSE source_record.campsite_count_kind
        END,
        campsite_count_source_updated_at = CASE
          WHEN input.campsite_count IS NOT NULL THEN input.checked_at
          ELSE source_record.campsite_count_source_updated_at
        END,
        campsite_count_checked_at = input.checked_at,
        updated_at = now()
      FROM input WHERE source_record.id = input.id
    `;

    await tx`
      WITH evidence_rows AS (
        SELECT source_record.campground_id, input.canonical_status,
          EXISTS (
            SELECT 1 FROM location_source_records corroborating
            WHERE corroborating.campground_id = source_record.campground_id
              AND corroborating.source <> 'outreserve'
              AND corroborating.import_status = 'accepted'
          ) AS has_other_source
        FROM jsonb_to_recordset(${toPostgresJson(results)}::jsonb)
          AS input(id text, canonical_status text)
        JOIN location_source_records source_record
          ON source_record.id = input.id::uuid
        WHERE source_record.campground_id IS NOT NULL
          AND input.canonical_status IS NOT NULL
      ), evidence AS (
        SELECT campground_id,
          CASE
            WHEN count(DISTINCT canonical_status) > 1 THEN 'review'
            ELSE min(canonical_status)
          END AS canonical_status,
          bool_or(has_other_source) AS has_other_source
        FROM evidence_rows
        GROUP BY campground_id
      )
      UPDATE campgrounds campground SET
        operational_status = CASE
          WHEN evidence.canonical_status = 'closed' AND evidence.has_other_source
            THEN 'review'::location_operational_status
          WHEN evidence.canonical_status = 'closed'
            THEN 'closed'::location_operational_status
          WHEN evidence.canonical_status = 'seasonal'
            AND campground.operational_status <> 'closed'
            THEN 'seasonal'::location_operational_status
          WHEN evidence.canonical_status = 'active'
            AND campground.operational_status = 'review'
            THEN 'active'::location_operational_status
          ELSE campground.operational_status
        END,
        active = CASE
          WHEN evidence.canonical_status = 'closed' AND NOT evidence.has_other_source
            THEN false
          ELSE campground.active
        END,
        field_provenance = CASE
          WHEN evidence.canonical_status IN ('closed', 'seasonal')
            OR (
              evidence.canonical_status = 'active'
              AND campground.operational_status = 'review'
            )
            THEN campground.field_provenance ||
              '{"operational_status":["outreserve",80]}'::jsonb
          ELSE campground.field_provenance
        END,
        updated_at = now()
      FROM evidence
      WHERE campground.id = evidence.campground_id
        AND NOT (
          campground.manual_locks @> ARRAY['operational_status']::text[]
          OR campground.manual_locks @> ARRAY['operationalStatus']::text[]
        )
    `;
  });
}

export async function refreshOutreserveDetails({
  limit = 500,
  batchSize = 100,
  concurrency = 2,
  staleDays = 90,
  allRecords = false,
  client,
}: Options = {}) {
  const apiClient =
    client || new OutreserveClient({ timeoutMs: 20_000, maxAttempts: 3 });
  const searchStatusBackfilled = await backfillOutreserveSearchStatus();
  const records = await sqlClient<SourceRecord[]>`
    SELECT source_record.id, source_record.external_id,
      source_record.raw_payload->>'outreserve_uuid' AS outreserve_uuid
    FROM location_source_records source_record
    JOIN campgrounds campground ON campground.id = source_record.campground_id
    WHERE source_record.source = 'outreserve'
      AND source_record.import_status = 'accepted'
      AND source_record.raw_payload->>'outreserve_uuid' IS NOT NULL
      AND campground.operational_status <> 'closed'
      AND (
        ${allRecords}
        OR source_record.raw_payload->>'instant_book' = 'true'
        OR jsonb_array_length(
          coalesce(source_record.raw_payload->'site_types', '[]'::jsonb)
        ) > 0
        OR source_record.campsite_count IS NOT NULL
      )
      AND (
        source_record.campsite_count_checked_at IS NULL
        OR source_record.campsite_count_checked_at
          < now() - make_interval(days => ${Math.max(1, staleDays)})
      )
    ORDER BY
      EXISTS (
        SELECT 1 FROM location_source_records other
        WHERE other.campground_id = source_record.campground_id
          AND other.campsite_count IS NOT NULL
      ) ASC,
      (source_record.raw_payload->>'instant_book' = 'true') DESC,
      jsonb_array_length(
        coalesce(source_record.raw_payload->'site_types', '[]'::jsonb)
      ) DESC,
      source_record.campsite_count_checked_at NULLS FIRST,
      source_record.external_id
    LIMIT ${Math.max(1, limit)}
  `;
  let processed = 0;
  let withInventory = 0;
  let statusChanges = 0;
  const errors: Array<{ externalId: string; message: string }> = [];
  const safeBatchSize = Math.max(1, Math.min(500, batchSize));
  const safeConcurrency = Math.max(1, Math.min(4, concurrency));
  for (let offset = 0; offset < records.length; offset += safeBatchSize) {
    const input = records.slice(offset, offset + safeBatchSize);
    const batch: DetailResult[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < input.length) {
        const record = input[cursor++];
        try {
          const response =
            await apiClient.get<OutreservePropertyDetailResponse>(
              `stays/properties/${encodeURIComponent(record.outreserve_uuid)}`,
            );
          const evidence = outreserveDetailEvidence(response);
          const checkedAt = new Date().toISOString();
          if (evidence.campsiteCount !== null) withInventory++;
          if (evidence.canonicalStatus !== null) statusChanges++;
          batch.push({
            id: record.id,
            provider_status: evidence.providerStatus,
            canonical_status: evidence.canonicalStatus,
            campsite_count: evidence.campsiteCount,
            checked_at: checkedAt,
            raw_patch: {
              provider_listing_status: evidence.providerStatus,
              provider_status_basis: "property_detail",
              provider_status_checked_at: checkedAt,
              reservable_site_inventory: evidence.campsiteCount,
              reservable_unit_type_counts: evidence.unitTypeCounts,
            },
          });
        } catch (error) {
          errors.push({
            externalId: record.external_id,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(safeConcurrency, input.length) }, () =>
        worker(),
      ),
    );
    await persistDetailBatch(batch);
    processed += input.length;
    console.log(
      JSON.stringify({
        event: "outreserve_detail_progress",
        processed,
        selected: records.length,
        withInventory,
        errors: errors.length,
      }),
    );
  }
  return {
    selected: records.length,
    processed,
    withInventory,
    statusEvidence: statusChanges,
    searchStatusBackfilled,
    errorCount: errors.length,
    errorSummary: Object.entries(
      errors.reduce<Record<string, number>>((summary, error) => {
        summary[error.message] = (summary[error.message] || 0) + 1;
        return summary;
      }, {}),
    ).map(([message, count]) => ({ message, count })),
    errorSamples: errors.slice(0, 10),
    coverage: await outreserveDetailCoverage(),
  };
}
