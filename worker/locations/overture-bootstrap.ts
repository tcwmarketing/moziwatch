import { createHash } from "node:crypto";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import {
  slugify,
  type ImportCounts,
  type LocationImportItem,
  type LocationSource,
  type NormalizedLocation,
} from "./types";
import { compactLocationRawPayload } from "./overture-retention";
import {
  compactNormalizedPayload,
  retainedContacts,
} from "./storage-retention";

const emptyCounts = (): ImportCounts => ({
  downloaded: 0,
  accepted: 0,
  excluded: 0,
  invalidCoordinates: 0,
  duplicatesPrevented: 0,
  inserted: 0,
  updated: 0,
  unchanged: 0,
  matched: 0,
  mergeCandidates: 0,
  skipped: 0,
});

const checksum = (record: NormalizedLocation) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        raw: compactLocationRawPayload(record),
        normalized: compactNormalizedPayload(record),
        contacts: retainedContacts(record),
      }),
    )
    .digest("hex");

function bootstrapSlug(record: NormalizedLocation) {
  const suffix = createHash("sha1")
    .update(`${record.source}:${record.externalId}`)
    .digest("hex")
    .slice(0, 8);
  return `${slugify(record.name).slice(0, 169)}-${suffix}`;
}

async function persistBatch(
  source: LocationSource,
  records: NormalizedLocation[],
  runId: string,
) {
  const requestedIds = records.map((record) => record.externalId);
  const tombstones = requestedIds.length
    ? await sqlClient<{ external_id: string }[]>`
        SELECT external_id FROM location_source_tombstones
        WHERE source = ${source} AND external_id = ANY(${requestedIds}::text[])
      `
    : [];
  const blocked = new Set(tombstones.map((row) => row.external_id));
  const retainedRecords = records.filter(
    (record) => !blocked.has(record.externalId),
  );
  const ids = retainedRecords.map((record) => record.externalId);
  if (!ids.length)
    return {
      inserted: 0,
      updated: 0,
      unchanged: 0,
      matched: 0,
      created: 0,
      tombstoned: records.length,
    };
  const existing = await sqlClient<{ external_id: string; checksum: string }[]>`
    SELECT external_id, checksum FROM location_source_records
    WHERE source = ${source} AND external_id = ANY(${ids}::text[])
  `;
  const previous = new Map(
    existing.map((row) => [row.external_id, row.checksum]),
  );
  const payload = retainedRecords.map((record) => {
    const [longitude, latitude] = record.geometry.coordinates as [
      number,
      number,
    ];
    return {
      externalId: record.externalId,
      sourceUrl: record.sourceUrl,
      sourceRecordUrl: record.sourceRecordUrl || record.sourceUrl,
      sourceRelease: record.sourceRelease,
      sourceUpdatedAt: record.sourceUpdatedAt,
      authoritative: Boolean(record.authoritative),
      checksum: checksum(record),
      raw: compactLocationRawPayload(record),
      normalized: {
        ...compactNormalizedPayload(record),
        bootstrapSlug: bootstrapSlug(record),
      },
      contacts: retainedContacts(record),
      longitude,
      latitude,
      priority: record.priority,
    };
  });

  const result = await sqlClient.begin(async (tx) => {
    const provider = retainedRecords[0];
    await tx`
      INSERT INTO location_source_providers (
        source, license, attribution, default_priority
      ) VALUES (
        ${source}, ${provider.license}, ${provider.attribution}, ${provider.priority}
      )
      ON CONFLICT (source) DO UPDATE SET
        license = excluded.license,
        attribution = excluded.attribution,
        default_priority = excluded.default_priority,
        updated_at = now()
    `;
    await tx`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${toPostgresJson(payload)}::jsonb) AS x(
          "externalId" text, "sourceUrl" text, "sourceRecordUrl" text,
          "sourceRelease" text, "sourceUpdatedAt" text,
          authoritative boolean, checksum text, raw jsonb,
          normalized jsonb, longitude double precision, latitude double precision,
          priority integer, contacts jsonb
        )
      )
      INSERT INTO location_source_records (
        source, external_id, source_url, source_record_url, source_release,
        source_updated_at, authoritative, import_status,
        fetched_at, last_seen_at, consecutive_missing_count, checksum, raw_payload,
        normalized_payload, source_geometry, representative_point, source_priority,
        contact_emails, related_urls,
        campsite_count, campsite_count_kind, campsite_count_source_updated_at,
        campsite_count_checked_at,
        import_run_id
      )
      SELECT ${source}, "externalId", "sourceUrl", "sourceRecordUrl",
        "sourceRelease", nullif("sourceUpdatedAt", '')::timestamptz,
        authoritative, 'accepted', now(), now(), 0,
        checksum, raw, normalized, NULL,
        extensions.st_setsrid(extensions.st_makepoint(longitude, latitude), 4326),
        priority,
        ARRAY(SELECT jsonb_array_elements_text(contacts->'emails')),
        ARRAY(SELECT jsonb_array_elements_text(contacts->'urls')),
        nullif(normalized->>'campsiteCount', '')::int,
        nullif(normalized->>'campsiteCountKind', '')::campsite_count_kind,
        CASE WHEN nullif(normalized->>'campsiteCount', '') IS NULL
          THEN NULL ELSE nullif("sourceUpdatedAt", '')::timestamptz END,
        CASE WHEN nullif(normalized->>'campsiteCount', '') IS NULL
          THEN NULL ELSE now() END,
        ${runId}::uuid
      FROM input
      ON CONFLICT (source, external_id) DO UPDATE SET
        source_url = excluded.source_url,
        source_record_url = excluded.source_record_url,
        source_release = excluded.source_release,
        source_updated_at = excluded.source_updated_at,
        authoritative = excluded.authoritative,
        import_status = excluded.import_status,
        fetched_at = excluded.fetched_at,
        last_seen_at = excluded.last_seen_at,
        consecutive_missing_count = 0,
        checksum = excluded.checksum,
        raw_payload = excluded.raw_payload,
        normalized_payload = excluded.normalized_payload,
        source_geometry = excluded.source_geometry,
        representative_point = excluded.representative_point,
        source_priority = excluded.source_priority,
        contact_emails = ARRAY(
          SELECT DISTINCT unnest(
            location_source_records.contact_emails || excluded.contact_emails
          ) ORDER BY 1
        ),
        related_urls = ARRAY(
          SELECT DISTINCT unnest(
            location_source_records.related_urls || excluded.related_urls
          ) ORDER BY 1
        ),
        campsite_count = coalesce(excluded.campsite_count, location_source_records.campsite_count),
        campsite_count_kind = coalesce(excluded.campsite_count_kind, location_source_records.campsite_count_kind),
        campsite_count_source_updated_at = coalesce(
          excluded.campsite_count_source_updated_at,
          location_source_records.campsite_count_source_updated_at
        ),
        campsite_count_checked_at = CASE
          WHEN excluded.campsite_count IS NOT NULL THEN now()
          ELSE location_source_records.campsite_count_checked_at
        END,
        import_run_id = excluded.import_run_id,
        updated_at = now()
    `;

    const matched = await tx<{ id: string }[]>`
      WITH possible AS (
        SELECT s.id AS source_id, c.id AS campground_id,
          row_number() OVER (
            PARTITION BY s.id
            ORDER BY extensions.st_distance(c.point::geography, s.representative_point::geography)
          ) AS position,
          count(*) OVER (PARTITION BY s.id) AS candidate_count
        FROM location_source_records s
        JOIN campgrounds c
          ON c.active = true
          AND c.country = s.normalized_payload->>'country'
          AND c.normalized_name = s.normalized_payload->>'normalizedName'
          AND extensions.st_dwithin(
            c.point::geography, s.representative_point::geography, 250
          )
        WHERE s.source = ${source}
          AND s.external_id = ANY(${ids}::text[])
          AND s.campground_id IS NULL
      ), selected AS (
        SELECT source_id, campground_id FROM possible
        WHERE position = 1 AND candidate_count = 1
      )
      UPDATE location_source_records s
      SET campground_id = selected.campground_id, updated_at = now()
      FROM selected WHERE s.id = selected.source_id
      RETURNING s.id
    `;

    const created = await tx<{ id: string }[]>`
      WITH unlinked AS (
        SELECT s.* FROM location_source_records s
        WHERE s.source = ${source}
          AND s.external_id = ANY(${ids}::text[])
          AND s.campground_id IS NULL
      ), inserted AS (
        INSERT INTO campgrounds (
          name, normalized_name, slug, location_type, address, city, region,
          country, postal_code, latitude, longitude, source_geometry, operator,
          website, phone, reservation_url, data_source,
          verification_status, field_provenance
        )
        SELECT
          normalized_payload->>'name', normalized_payload->>'normalizedName',
          normalized_payload->>'bootstrapSlug',
          (normalized_payload->>'locationType')::location_type,
          normalized_payload->>'address', normalized_payload->>'locality',
          normalized_payload->>'region', normalized_payload->>'country', '',
          extensions.st_y(representative_point),
          extensions.st_x(representative_point), source_geometry,
          nullif(normalized_payload->>'operator', ''),
          nullif(normalized_payload->>'website', ''),
          nullif(normalized_payload->>'phone', ''),
          nullif(normalized_payload->>'reservationUrl', ''), source,
          CASE WHEN source_priority >= 80
            THEN 'source_verified'::location_verification_status
            ELSE 'unverified'::location_verification_status
          END,
          jsonb_build_object(
            '_', jsonb_build_array(source, source_priority)
          )
        FROM unlinked
        ON CONFLICT (slug) DO NOTHING
        RETURNING id, slug
      ), linked AS (
        UPDATE location_source_records s
        SET campground_id = inserted.id, updated_at = now()
        FROM inserted
        WHERE s.source = ${source}
          AND s.external_id = ANY(${ids}::text[])
          AND s.campground_id IS NULL
          AND inserted.slug = s.normalized_payload->>'bootstrapSlug'
        RETURNING inserted.id
      )
      SELECT id FROM linked
    `;
    return { matched: matched.length, created: created.length };
  });

  const states = { inserted: 0, updated: 0, unchanged: 0 };
  for (const item of payload) {
    const before = previous.get(item.externalId);
    if (!before) states.inserted++;
    else if (before === item.checksum) states.unchanged++;
    else states.updated++;
  }
  return {
    ...states,
    ...result,
    tombstoned: records.length - retainedRecords.length,
  };
}

export async function processInitialOvertureImport(
  source: LocationSource,
  records: AsyncIterable<LocationImportItem>,
  datasetVersion: string,
  batchSize = 1_000,
) {
  const run = await sqlClient<{ id: string }[]>`
    INSERT INTO location_import_runs (source, dataset_version, dry_run, options)
    VALUES (${source}, ${datasetVersion}, false,
      ${toPostgresJson({ bootstrap: true, batchSize })}::jsonb)
    RETURNING id
  `;
  const runId = run[0].id;
  const counts = emptyCounts();
  let batch: NormalizedLocation[] = [];
  try {
    const flush = async () => {
      if (!batch.length) return;
      const result = await persistBatch(source, batch, runId);
      counts.inserted += result.inserted;
      counts.updated += result.updated;
      counts.unchanged += result.unchanged;
      counts.matched += result.matched;
      counts.duplicatesPrevented += result.matched;
      counts.skipped += result.tombstoned;
      batch = [];
      await sqlClient`
        UPDATE location_import_runs SET
          records_downloaded = ${counts.downloaded}, records_accepted = ${counts.accepted},
          records_excluded = ${counts.excluded}, invalid_coordinates = ${counts.invalidCoordinates},
          duplicates_prevented = ${counts.duplicatesPrevented}, records_inserted = ${counts.inserted},
          records_updated = ${counts.updated}, records_unchanged = ${counts.unchanged},
          records_matched = ${counts.matched}, records_skipped = ${counts.skipped},
          checkpoint = ${toPostgresJson({ processed: counts.downloaded })}::jsonb
        WHERE id = ${runId}::uuid
      `;
      console.log(
        JSON.stringify({
          event: "overture_bootstrap_checkpoint",
          source,
          runId,
          counts,
        }),
      );
    };
    for await (const item of records) {
      counts.downloaded++;
      if ("rejected" in item) {
        counts.excluded++;
        counts.skipped++;
        if (item.invalidCoordinates) counts.invalidCoordinates++;
      } else {
        counts.accepted++;
        batch.push(item);
      }
      if (batch.length >= batchSize) await flush();
    }
    await flush();
    await sqlClient`
      UPDATE location_source_records SET
        consecutive_missing_count = consecutive_missing_count + 1,
        updated_at = now()
      WHERE source = ${source} AND import_run_id <> ${runId}::uuid
    `;
    await sqlClient`
      UPDATE campgrounds c SET operational_status = 'review', updated_at = now()
      WHERE c.operational_status <> 'closed'
        AND EXISTS (
          SELECT 1 FROM location_source_records missing
          WHERE missing.campground_id = c.id
            AND missing.source = ${source}
            AND missing.consecutive_missing_count >= 2
        )
        AND NOT EXISTS (
          SELECT 1 FROM location_source_records current_source
          WHERE current_source.campground_id = c.id
            AND current_source.consecutive_missing_count < 2
        )
    `;
    await sqlClient`
      UPDATE location_import_runs SET status = 'completed', completed_at = now(),
        checkpoint = ${toPostgresJson({ processed: counts.downloaded, complete: true })}::jsonb
      WHERE id = ${runId}::uuid
    `;
    return { runId, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sqlClient`
      UPDATE location_import_runs SET status = 'failed', completed_at = now(),
        errors = ${toPostgresJson([{ message }])}::jsonb
      WHERE id = ${runId}::uuid
    `;
    throw error;
  }
}
