import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import { fetchWithRetry } from "./retry";
import { ridbCampsiteCount, type RidbCapacityPayload } from "./capacity-values";

export async function backfillEmbeddedCampsiteCounts() {
  const rows = await sqlClient<{ id: string }[]>`
    WITH measured AS (
      SELECT id, source,
        CASE
          WHEN source = 'bc-recreation'
            AND raw_payload->>'NUM_CAMP_SITES' ~ '^[0-9]+$'
            THEN (raw_payload->>'NUM_CAMP_SITES')::int
          WHEN source = 'bc-parks'
            AND raw_payload->>'officialCampsiteCount' ~ '^[0-9]+$'
            THEN (raw_payload->>'officialCampsiteCount')::int
          WHEN source = 'quebec-tourism' THEN
            (CASE WHEN raw_payload#>>'{Emplacementss,0,Sitesacamper}' ~ '^[0-9]+$'
              THEN (raw_payload#>>'{Emplacementss,0,Sitesacamper}')::int ELSE 0 END)
            +
            (CASE WHEN raw_payload#>>'{Emplacementss,0,Pretsacamper}' ~ '^[0-9]+$'
              THEN (raw_payload#>>'{Emplacementss,0,Pretsacamper}')::int ELSE 0 END)
          WHEN source = 'openstreetmap'
            AND raw_payload->>'capacity' ~ '^[0-9]+$'
            THEN (raw_payload->>'capacity')::int
          WHEN source = 'openstreetmap'
            AND raw_payload->>'capacity:pitches' ~ '^[0-9]+$'
            THEN (raw_payload->>'capacity:pitches')::int
          WHEN source = 'openstreetmap' THEN greatest(
            CASE WHEN raw_payload->>'capacity:tents' ~ '^[0-9]+$'
              THEN (raw_payload->>'capacity:tents')::int ELSE 0 END,
            CASE WHEN raw_payload->>'capacity:caravans' ~ '^[0-9]+$'
              THEN (raw_payload->>'capacity:caravans')::int ELSE 0 END,
            CASE WHEN raw_payload->>'capacity:motorhome' ~ '^[0-9]+$'
              THEN (raw_payload->>'capacity:motorhome')::int ELSE 0 END
          )
          WHEN source = 'nps'
            AND raw_payload#>>'{campsites,totalSites}' ~ '^[0-9]+$'
            THEN (raw_payload#>>'{campsites,totalSites}')::int
        END AS campsite_count,
        CASE WHEN source = 'openstreetmap' THEN 'mapped_capacity'
          ELSE 'official_total' END AS campsite_count_kind
      FROM location_source_records
      WHERE campground_id IS NOT NULL AND import_status = 'accepted'
        AND source IN (
          'bc-recreation', 'bc-parks', 'quebec-tourism', 'openstreetmap', 'nps'
        )
    )
    UPDATE location_source_records source_record SET
      campsite_count = measured.campsite_count,
      campsite_count_kind = measured.campsite_count_kind::campsite_count_kind,
      campsite_count_source_updated_at = coalesce(
        source_record.source_updated_at, source_record.fetched_at
      ),
      campsite_count_checked_at = now(),
      updated_at = now()
    FROM measured
    WHERE source_record.id = measured.id
      AND measured.campsite_count BETWEEN 1 AND 100000
      AND (
        source_record.campsite_count IS DISTINCT FROM measured.campsite_count
        OR source_record.campsite_count_kind::text IS DISTINCT FROM measured.campsite_count_kind
      )
    RETURNING source_record.id
  `;
  return rows.length;
}

type RidbCapacityOptions = {
  limit?: number;
  concurrency?: number;
  staleDays?: number;
  batchSize?: number;
};

export async function refreshRidbCampsiteCounts({
  limit = 500,
  concurrency = 2,
  staleDays = 30,
  batchSize = 100,
}: RidbCapacityOptions = {}) {
  const apiKey = process.env.RIDB_API_KEY;
  if (!apiKey) throw new Error("RIDB_API_KEY is required");
  const base = (
    process.env.RIDB_BASE_URL || "https://ridb.recreation.gov/api/v1"
  ).replace(/\/$/, "");
  const records = await sqlClient<Array<{ id: string; external_id: string }>>`
    SELECT source_record.id, source_record.external_id
    FROM location_source_records source_record
    JOIN campgrounds campground ON campground.id = source_record.campground_id
    WHERE source_record.source = 'ridb'
      AND source_record.import_status = 'accepted'
      AND campground.active = true
      AND (
        source_record.campsite_count_checked_at IS NULL
        OR source_record.campsite_count_checked_at
          < now() - make_interval(days => ${Math.max(1, staleDays)})
      )
    ORDER BY source_record.campsite_count_checked_at NULLS FIRST,
      source_record.external_id
    LIMIT ${Math.max(1, limit)}
  `;
  let refreshed = 0;
  let withInventory = 0;
  let attempted = 0;
  let halted = false;
  let consecutiveRateLimits = 0;
  const errors: Array<{ externalId: string; message: string }> = [];

  for (let offset = 0; offset < records.length; offset += batchSize) {
    const batch = records.slice(offset, offset + batchSize);
    const results: Array<{
      id: string;
      campsite_count: number | null;
      checked_at: string;
    }> = [];
    let cursor = 0;
    const worker = async () => {
      while (!halted && cursor < batch.length) {
        const record = batch[cursor++];
        attempted++;
        try {
          const url = new URL(
            `${base}/facilities/${encodeURIComponent(record.external_id)}/campsites`,
          );
          url.searchParams.set("limit", "1");
          url.searchParams.set("offset", "0");
          const response = await fetchWithRetry(
            url.toString(),
            { headers: { apikey: apiKey } },
            3,
          );
          const campsiteCount = ridbCampsiteCount(
            (await response.json()) as RidbCapacityPayload,
          );
          results.push({
            id: record.id,
            campsite_count: campsiteCount,
            checked_at: new Date().toISOString(),
          });
          consecutiveRateLimits = 0;
        } catch (error) {
          const message =
            error instanceof Error ? error.message : String(error);
          errors.push({
            externalId: record.external_id,
            message,
          });
          if (/429|rate.?limit/i.test(message)) {
            consecutiveRateLimits++;
            if (consecutiveRateLimits >= Math.max(2, concurrency))
              halted = true;
          } else {
            consecutiveRateLimits = 0;
          }
        }
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.max(1, Math.min(8, concurrency, batch.length)) },
        () => worker(),
      ),
    );
    if (results.length) {
      await sqlClient`
        WITH input AS (
          SELECT id::uuid, campsite_count, checked_at::timestamptz
          FROM jsonb_to_recordset(${toPostgresJson(results)}::jsonb)
            AS x(id text, campsite_count integer, checked_at text)
        )
        UPDATE location_source_records source_record SET
          campsite_count = input.campsite_count,
          campsite_count_kind = CASE WHEN input.campsite_count IS NULL
            THEN NULL ELSE 'reservable_inventory'::campsite_count_kind END,
          campsite_count_source_updated_at = input.checked_at,
          campsite_count_checked_at = input.checked_at,
          updated_at = now()
        FROM input WHERE source_record.id = input.id
      `;
      refreshed += results.length;
      withInventory += results.filter(
        (result) => result.campsite_count !== null,
      ).length;
    }
    console.log(
      JSON.stringify({
        event: "ridb_capacity_progress",
        processed: Math.min(offset + batch.length, records.length),
        total: records.length,
        refreshed,
        errors: errors.length,
        halted,
      }),
    );
    if (halted) break;
  }
  const errorSummary = Object.entries(
    errors.reduce<Record<string, number>>((summary, error) => {
      summary[error.message] = (summary[error.message] || 0) + 1;
      return summary;
    }, {}),
  ).map(([message, count]) => ({ message, count }));
  return {
    selected: records.length,
    attempted,
    refreshed,
    withInventory,
    errorCount: errors.length,
    errorSummary,
    errorSamples: errors.slice(0, 10),
    stoppedReason: halted ? "RIDB rate limit reached; retry after reset" : null,
  };
}

export async function campsiteCountCoverage() {
  return sqlClient`
    SELECT campsite_count_kind AS kind,
      count(*)::int AS source_records,
      count(DISTINCT campground_id)::int AS campgrounds
    FROM location_source_records
    WHERE campground_id IS NOT NULL AND campsite_count IS NOT NULL
    GROUP BY campsite_count_kind ORDER BY campsite_count_kind
  `;
}
