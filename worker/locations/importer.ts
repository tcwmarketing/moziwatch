import { createHash } from "node:crypto";
import type postgres from "postgres";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import {
  MATCH_THRESHOLDS,
  scoreLocationMatch,
  type MatchCandidate,
} from "./matching";
import {
  cleanDisplayName,
  normalizeName,
  slugify,
  type ImportCounts,
  type ImportOptions,
  type LocationImportItem,
  type NormalizedLocation,
} from "./types";
import { compactLocationRawPayload } from "./overture-retention";
import {
  compactNormalizedPayload,
  retainedContacts,
  retainedSourceGeometry,
} from "./storage-retention";
import {
  compactProvenance,
  provenancePriority,
  type Provenance,
} from "./provenance";

type Tx = postgres.TransactionSql;
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

function checksum(record: NormalizedLocation) {
  const contacts = retainedContacts(record);
  return createHash("sha256")
    .update(
      JSON.stringify({
        raw: compactLocationRawPayload(record),
        normalized: compactNormalizedPayload(record),
        contacts,
      }),
    )
    .digest("hex");
}

function structured(event: string, details: Record<string, unknown>) {
  console.log(
    JSON.stringify({ timestamp: new Date().toISOString(), event, ...details }),
  );
}

async function sourceUpsert(tx: Tx, record: NormalizedLocation, runId: string) {
  const digest = checksum(record);
  const retainedRaw = compactLocationRawPayload(record);
  const contacts = retainedContacts(record);
  await tx`
    INSERT INTO location_source_providers (
      source, license, attribution, default_priority
    ) VALUES (
      ${record.source}, ${record.license}, ${record.attribution}, ${record.priority}
    )
    ON CONFLICT (source) DO UPDATE SET
      license = excluded.license,
      attribution = excluded.attribution,
      default_priority = excluded.default_priority,
      updated_at = now()
  `;
  const existing = await tx<
    { id: string; campground_id: string | null; checksum: string }[]
  >`
    SELECT id, campground_id, checksum FROM location_source_records
    WHERE source = ${record.source} AND external_id = ${record.externalId}
  `;
  const geometry = toPostgresJson(record.geometry);
  const retainedGeometry = toPostgresJson(
    retainedSourceGeometry(record.geometry),
  );
  const normalized = toPostgresJson(compactNormalizedPayload(record));
  const rows = await tx<{ id: string; campground_id: string | null }[]>`
    INSERT INTO location_source_records (
      source, external_id, campground_id, source_url, source_record_url,
      source_release, source_updated_at, authoritative, import_status,
      fetched_at, last_seen_at, consecutive_missing_count, checksum, raw_payload,
      normalized_payload, source_geometry, representative_point, source_priority,
      contact_emails, related_urls,
      campsite_count, campsite_count_kind, campsite_count_source_updated_at,
      campsite_count_checked_at,
      import_run_id
    ) VALUES (
      ${record.source}, ${record.externalId}, ${existing[0]?.campground_id || null},
      ${record.sourceUrl}, ${record.sourceRecordUrl || record.sourceUrl},
      ${record.sourceRelease || null}, ${record.sourceUpdatedAt || null},
      ${Boolean(record.authoritative)}, 'accepted', now(), now(), 0,
      ${digest}, ${toPostgresJson(retainedRaw)}::jsonb, ${normalized}::jsonb,
      ${retainedGeometry}::jsonb,
      extensions.st_pointonsurface(
        extensions.st_setsrid(extensions.st_geomfromgeojson(${geometry}), 4326)
      ),
      ${record.priority}, ${contacts.emails}, ${contacts.urls},
      ${record.campsiteCount ?? null},
      ${record.campsiteCountKind ?? null}::campsite_count_kind,
      ${record.campsiteCount ? record.sourceUpdatedAt || null : null},
      CASE WHEN ${record.campsiteCount ?? null}::int IS NULL THEN NULL ELSE now() END,
      ${runId}::uuid
    )
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
    RETURNING id, campground_id
  `;
  return {
    ...rows[0],
    state: !existing[0]
      ? ("inserted" as const)
      : existing[0].checksum === digest
        ? ("unchanged" as const)
        : ("updated" as const),
  };
}

async function candidates(
  tx: Tx,
  sourceRecordId: string,
  record: NormalizedLocation,
) {
  const rows = await tx<
    Array<{
      id: string;
      name: string;
      normalized_name: string;
      country: string;
      region: string;
      address: string;
      website: string | null;
      phone: string | null;
      operator: string | null;
      parent_name: string | null;
      distance_meters: number;
      name_similarity: number;
    }>
  >`
    SELECT c.id, c.name, c.normalized_name, c.country, c.region, c.address, c.website,
      c.phone, c.operator, parent.name AS parent_name,
      extensions.st_distance(c.point::geography, s.representative_point::geography) AS distance_meters,
      extensions.similarity(c.normalized_name, ${record.normalizedName}) AS name_similarity
    FROM location_source_records s
    JOIN campgrounds c ON c.active = true AND c.country = ${record.country}
    LEFT JOIN campgrounds parent ON parent.id = c.parent_id
    WHERE s.id = ${sourceRecordId}::uuid
      AND extensions.st_dwithin(
        c.point::geography,
        s.representative_point::geography,
        ${MATCH_THRESHOLDS.maxDistanceMeters}
      )
    ORDER BY c.point <-> s.representative_point
    LIMIT 25
  `;
  return rows
    .map((row) => {
      const candidate: MatchCandidate = {
        id: row.id,
        name: row.name,
        normalizedName: row.normalized_name,
        country: row.country,
        region: row.region,
        address: row.address,
        website: row.website,
        phone: row.phone,
        operator: row.operator,
        parentName: row.parent_name,
        distanceMeters: Number(row.distance_meters),
        nameSimilarity: Number(row.name_similarity),
      };
      return { candidate, result: scoreLocationMatch(record, candidate) };
    })
    .sort((a, b) => b.result.score - a.result.score);
}

async function uniqueSlug(tx: Tx, record: NormalizedLocation) {
  const base = slugify(record.name);
  void tx;
  const suffix = createHash("sha1")
    .update(`${record.source}:${record.externalId}`)
    .digest("hex")
    .slice(0, 8);
  return `${base.slice(0, 169)}-${suffix}`;
}

function initialProvenance(record: NormalizedLocation): Provenance {
  return { _: [record.source, record.priority] };
}

async function createCanonical(
  tx: Tx,
  sourceRecordId: string,
  record: NormalizedLocation,
) {
  const slug = await uniqueSlug(tx, record);
  const rows = await tx<{ id: string }[]>`
    INSERT INTO campgrounds (
      name, normalized_name, slug, location_type, address, city, region, country,
      postal_code, latitude, longitude, source_geometry, operator, website, phone,
      reservation_url, data_source, verification_status,
      field_provenance
    )
    SELECT
      ${record.name}, ${record.normalizedName}, ${slug}, ${record.locationType},
      ${record.address}, ${record.locality}, ${record.region}, ${record.country}, '',
      extensions.st_y(representative_point),
      extensions.st_x(representative_point),
      source_geometry, ${record.operator}, ${record.website}, ${record.phone},
      ${record.reservationUrl}, ${record.source},
      ${record.priority >= 80 ? "source_verified" : "unverified"}::location_verification_status,
      ${toPostgresJson(compactProvenance(initialProvenance(record)))}::jsonb
    FROM location_source_records WHERE id = ${sourceRecordId}::uuid
    RETURNING id
  `;
  await tx`
    UPDATE location_source_records SET campground_id = ${rows[0].id}::uuid
    WHERE id = ${sourceRecordId}::uuid
  `;
  return rows[0].id;
}

async function dismissPendingCandidates(tx: Tx, sourceRecordId: string) {
  await tx`
    UPDATE location_merge_candidates SET status = 'rejected', reviewed_at = now()
    WHERE source_record_id = ${sourceRecordId}::uuid AND status = 'pending'
  `;
}

function usable(value: unknown) {
  return (
    value !== null &&
    value !== undefined &&
    value !== "" &&
    value !== "Unknown" &&
    value !== "Address not provided"
  );
}

async function updateCanonical(
  tx: Tx,
  campgroundId: string,
  sourceRecordId: string,
  record: NormalizedLocation,
) {
  const rows = await tx<
    Array<{
      name: string;
      normalized_name: string;
      location_type: NormalizedLocation["locationType"];
      address: string;
      city: string;
      region: string;
      country: string;
      latitude: number;
      longitude: number;
      operator: string | null;
      website: string | null;
      phone: string | null;
      reservation_url: string | null;
      source_geometry: Record<string, unknown> | null;
      manual_locks: string[];
      field_provenance: Provenance;
    }>
  >`
    SELECT name, normalized_name, location_type, address, city, region, country,
      latitude, longitude, operator, website, phone, reservation_url,
      source_geometry,
      manual_locks, field_provenance
    FROM campgrounds WHERE id = ${campgroundId}::uuid FOR UPDATE
  `;
  if (!rows[0])
    throw new Error("Matched canonical campground no longer exists");
  const current = rows[0];
  const point = await tx<{ latitude: number; longitude: number }[]>`
    SELECT extensions.st_y(representative_point) AS latitude,
      extensions.st_x(representative_point) AS longitude
    FROM location_source_records WHERE id = ${sourceRecordId}::uuid
  `;
  const provenance = { ...(current.field_provenance || {}) };
  const locks = new Set(current.manual_locks || []);
  const incoming: Record<string, unknown> = {
    name: record.name,
    locationType: record.locationType,
    address: record.address,
    city: record.locality,
    region: record.region,
    country: record.country,
    coordinates: point[0],
    operator: record.operator,
    website: record.website,
    phone: record.phone,
    reservationUrl: record.reservationUrl,
  };
  const selected: Record<string, unknown> = {
    name: current.name,
    locationType: current.location_type,
    address: current.address,
    city: current.city,
    region: current.region,
    country: current.country,
    coordinates: { latitude: current.latitude, longitude: current.longitude },
    operator: current.operator,
    website: current.website,
    phone: current.phone,
    reservationUrl: current.reservation_url,
    sourceGeometry: current.source_geometry,
  };
  const useIncomingGeometry =
    !locks.has("coordinates") &&
    usable(point[0]) &&
    record.priority >= provenancePriority(provenance, "coordinates");
  for (const [field, value] of Object.entries(incoming)) {
    const existingPriority = provenancePriority(provenance, field);
    if (
      !locks.has(field) &&
      usable(value) &&
      (!usable(selected[field]) || record.priority >= existingPriority)
    ) {
      selected[field] = value;
      provenance[field] = [record.source, record.priority];
    }
  }
  const coordinates = selected.coordinates as {
    latitude: number;
    longitude: number;
  };
  if (useIncomingGeometry)
    selected.sourceGeometry = retainedSourceGeometry(record.geometry);
  await tx`
    UPDATE campgrounds SET
      name = ${String(selected.name)},
      normalized_name = ${normalizeName(String(selected.name))},
      location_type = ${String(selected.locationType)}::location_type,
      address = ${String(selected.address)}, city = ${String(selected.city)},
      region = ${String(selected.region)}, country = ${String(selected.country)},
      latitude = ${coordinates.latitude}, longitude = ${coordinates.longitude},
      operator = ${selected.operator as string | null},
      website = ${selected.website as string | null}, phone = ${selected.phone as string | null},
      reservation_url = ${selected.reservationUrl as string | null},
      source_geometry = ${toPostgresJson(selected.sourceGeometry)}::jsonb,
      field_provenance = ${toPostgresJson(compactProvenance(provenance))}::jsonb,
      verification_status = CASE
        WHEN verification_status = 'unverified' AND ${record.priority} >= 80
          THEN 'source_verified'::location_verification_status
        ELSE verification_status
      END,
      updated_at = now()
    WHERE id = ${campgroundId}::uuid
  `;
  await tx`
    UPDATE location_source_records SET campground_id = ${campgroundId}::uuid
    WHERE id = ${sourceRecordId}::uuid
  `;
}

export async function applyStoredSourceToCanonical(
  tx: Tx,
  campgroundId: string,
  sourceRecordId: string,
) {
  const rows = await tx<
    Array<{
      source: NormalizedLocation["source"];
      external_id: string;
      source_url: string | null;
      license: string;
      attribution: string;
      source_priority: number;
      normalized_payload: Omit<
        NormalizedLocation,
        | "source"
        | "externalId"
        | "sourceUrl"
        | "license"
        | "attribution"
        | "priority"
        | "geometry"
        | "raw"
      >;
      source_geometry: NormalizedLocation["geometry"];
      raw_payload: Record<string, unknown>;
    }>
  >`
    SELECT r.source, r.external_id, r.source_url, p.license, p.attribution,
      source_priority, normalized_payload,
      coalesce(
        source_geometry,
        jsonb_build_object(
          'type', 'Point',
          'coordinates', jsonb_build_array(
            extensions.st_x(representative_point),
            extensions.st_y(representative_point)
          )
        )
      ) AS source_geometry,
      raw_payload
    FROM location_source_records r
    JOIN location_source_providers p ON p.source = r.source
    WHERE r.id = ${sourceRecordId}::uuid
  `;
  if (!rows[0]) throw new Error("Source record no longer exists");
  const row = rows[0];
  await updateCanonical(tx, campgroundId, sourceRecordId, {
    ...row.normalized_payload,
    description: null,
    parentName: row.normalized_payload.parentName ?? null,
    operator: row.normalized_payload.operator ?? null,
    website: row.normalized_payload.website ?? null,
    phone: row.normalized_payload.phone ?? null,
    reservationUrl: row.normalized_payload.reservationUrl ?? null,
    campsiteCount: row.normalized_payload.campsiteCount ?? null,
    campsiteCountKind: row.normalized_payload.campsiteCountKind ?? null,
    source: row.source,
    externalId: row.external_id,
    sourceUrl: row.source_url,
    license: row.license,
    attribution: row.attribution,
    priority: row.source_priority,
    geometry: row.source_geometry,
    raw: row.raw_payload,
  });
}

async function persistOne(tx: Tx, record: NormalizedLocation, runId: string) {
  const source = await sourceUpsert(tx, record, runId);
  if (source.campground_id) {
    await updateCanonical(tx, source.campground_id, source.id, record);
    await dismissPendingCandidates(tx, source.id);
    return { state: source.state, matched: false, candidate: false };
  }
  const possible = await candidates(tx, source.id, record);
  const best = possible[0];
  if (best && best.result.score >= MATCH_THRESHOLDS.automatic) {
    await updateCanonical(tx, best.candidate.id, source.id, record);
    await dismissPendingCandidates(tx, source.id);
    return { state: source.state, matched: true, candidate: false };
  }
  if (best && best.result.score >= MATCH_THRESHOLDS.review) {
    const existingCandidate = await tx<{ exists: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM location_merge_candidates
        WHERE source_record_id = ${source.id}::uuid
          AND suggested_campground_id = ${best.candidate.id}::uuid
      ) AS exists
    `;
    await tx`
        INSERT INTO location_merge_candidates (
          source_record_id, suggested_campground_id, match_score, reasons,
          distance_meters, name_similarity, website_match, phone_match
        ) VALUES (
          ${source.id}::uuid, ${best.candidate.id}::uuid, ${best.result.score},
          ${toPostgresJson(best.result.reasons)}::jsonb,
          ${best.candidate.distanceMeters}, ${best.result.nameSimilarity},
          ${Boolean(best.result.websiteMatch)}, ${Boolean(best.result.phoneMatch)}
        )
        ON CONFLICT (source_record_id, suggested_campground_id) DO UPDATE SET
          match_score = excluded.match_score, reasons = excluded.reasons,
          distance_meters = excluded.distance_meters,
          name_similarity = excluded.name_similarity,
          website_match = excluded.website_match, phone_match = excluded.phone_match
        WHERE location_merge_candidates.status = 'pending'
      `;
    return {
      state: source.state,
      matched: false,
      candidate: !existingCandidate[0].exists,
    };
  }
  await createCanonical(tx, source.id, record);
  await dismissPendingCandidates(tx, source.id);
  return { state: source.state, matched: false, candidate: false };
}

async function persistBatch(records: NormalizedLocation[], runId: string) {
  return sqlClient.begin(async (tx) => {
    const keys = records.map((record) => ({
      source: record.source,
      externalId: record.externalId,
    }));
    const tombstones = keys.length
      ? await tx<Array<{ source: string; external_id: string }>>`
          WITH input AS (
            SELECT * FROM jsonb_to_recordset(${toPostgresJson(keys)}::jsonb)
              AS x(source text, "externalId" text)
          )
          SELECT tombstone.source, tombstone.external_id
          FROM location_source_tombstones tombstone
          JOIN input ON input.source = tombstone.source
            AND input."externalId" = tombstone.external_id
        `
      : [];
    const blocked = new Set(
      tombstones.map((row) => `${row.source}:${row.external_id}`),
    );
    const results = [];
    for (const record of records) {
      if (blocked.has(`${record.source}:${record.externalId}`)) {
        results.push({
          state: "unchanged" as const,
          matched: false,
          candidate: false,
          skipped: true,
        });
      } else {
        results.push({
          ...(await persistOne(tx, record, runId)),
          skipped: false,
        });
      }
    }
    return results;
  });
}

async function beginRun(source: string, options: ImportOptions) {
  if (options.resumeRunId) {
    const rows = await sqlClient<
      Array<{
        id: string;
        source: string;
        records_downloaded: number;
        records_accepted: number;
        records_excluded: number;
        invalid_coordinates: number;
        duplicates_prevented: number;
        records_inserted: number;
        records_updated: number;
        records_unchanged: number;
        records_matched: number;
        merge_candidates_created: number;
        records_skipped: number;
        checkpoint: { processed?: number };
      }>
    >`
      UPDATE location_import_runs SET status = 'running', completed_at = NULL
      WHERE id = ${options.resumeRunId}::uuid AND source = ${source}
        AND status IN ('running', 'failed', 'partial')
      RETURNING id, source, records_downloaded, records_accepted,
        records_excluded, invalid_coordinates, duplicates_prevented, records_inserted,
        records_updated, records_unchanged, records_matched,
        merge_candidates_created, records_skipped, checkpoint
    `;
    if (!rows[0]) throw new Error("The requested import run cannot be resumed");
    const row = rows[0];
    return {
      runId: row.id,
      resumeProcessed: Number(
        row.checkpoint?.processed || row.records_downloaded || 0,
      ),
      counts: {
        downloaded: Number(row.records_downloaded),
        accepted: Number(row.records_accepted),
        excluded: Number(row.records_excluded),
        invalidCoordinates: Number(row.invalid_coordinates),
        duplicatesPrevented: Number(row.duplicates_prevented),
        inserted: Number(row.records_inserted),
        updated: Number(row.records_updated),
        unchanged: Number(row.records_unchanged),
        matched: Number(row.records_matched),
        mergeCandidates: Number(row.merge_candidates_created),
        skipped: Number(row.records_skipped),
      },
    };
  }
  const rows = await sqlClient<{ id: string }[]>`
    INSERT INTO location_import_runs (source, dataset_version, dry_run, options)
    VALUES (${source}, ${options.datasetVersion || null}, ${options.dryRun},
      ${toPostgresJson(options)}::jsonb)
    RETURNING id
  `;
  return { runId: rows[0].id, resumeProcessed: 0, counts: emptyCounts() };
}

export async function processLocationImport(
  source: NormalizedLocation["source"],
  records: AsyncIterable<LocationImportItem>,
  options: ImportOptions,
) {
  const run = await beginRun(source, options);
  const { runId } = run;
  const counts = run.counts;
  let committedCounts = { ...counts };
  let replayed = 0;
  let batch: NormalizedLocation[] = [];
  structured("location_import_started", { source, runId, options });
  try {
    const flush = async () => {
      if (!options.dryRun && batch.length) {
        const results = await persistBatch(batch, runId);
        for (const result of results) {
          if (result.skipped) {
            counts.skipped++;
            continue;
          }
          counts[result.state]++;
          if (result.matched) {
            counts.matched++;
            counts.duplicatesPrevented++;
          }
          if (result.candidate) counts.mergeCandidates++;
        }
        batch = [];
      }
      await sqlClient`
        UPDATE location_import_runs SET
          checkpoint = ${toPostgresJson({ processed: counts.downloaded })}::jsonb,
          records_downloaded = ${counts.downloaded}, records_accepted = ${counts.accepted},
          records_excluded = ${counts.excluded}, invalid_coordinates = ${counts.invalidCoordinates},
          duplicates_prevented = ${counts.duplicatesPrevented}, records_inserted = ${counts.inserted},
          records_updated = ${counts.updated}, records_unchanged = ${counts.unchanged},
          records_matched = ${counts.matched}, merge_candidates_created = ${counts.mergeCandidates},
          records_skipped = ${counts.skipped}
        WHERE id = ${runId}::uuid
      `;
      committedCounts = { ...counts };
      structured("location_import_checkpoint", { source, runId, counts });
    };

    for await (const item of records) {
      if (options.limit && counts.downloaded >= options.limit) break;
      if (replayed < run.resumeProcessed) {
        replayed++;
        continue;
      }
      counts.downloaded++;
      if ("rejected" in item) {
        counts.excluded++;
        counts.skipped++;
        if (item.invalidCoordinates) counts.invalidCoordinates++;
        if (counts.downloaded - committedCounts.downloaded >= options.batchSize)
          await flush();
        continue;
      }
      const cleanedName = cleanDisplayName(item.name);
      if (!cleanedName) {
        counts.excluded++;
        counts.skipped++;
        if (counts.downloaded - committedCounts.downloaded >= options.batchSize)
          await flush();
        continue;
      }
      const record = {
        ...item,
        name: cleanedName,
        normalizedName: normalizeName(cleanedName),
      };
      counts.accepted++;
      if (options.country && record.country !== options.country) {
        counts.skipped++;
      } else if (options.region && record.region !== options.region) {
        counts.skipped++;
      } else if (options.dryRun) {
        counts.inserted++;
      } else {
        batch.push(record);
      }
      if (counts.downloaded - committedCounts.downloaded >= options.batchSize)
        await flush();
    }
    if (counts.downloaded > committedCounts.downloaded) await flush();
    if (!options.dryRun && !options.limit) {
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
    }
    await sqlClient`
      UPDATE location_import_runs SET status = 'completed', completed_at = now(),
        records_downloaded = ${counts.downloaded}, records_accepted = ${counts.accepted},
        records_excluded = ${counts.excluded}, invalid_coordinates = ${counts.invalidCoordinates},
        duplicates_prevented = ${counts.duplicatesPrevented}, records_inserted = ${counts.inserted},
        records_updated = ${counts.updated}, records_unchanged = ${counts.unchanged},
        records_matched = ${counts.matched}, merge_candidates_created = ${counts.mergeCandidates},
        records_skipped = ${counts.skipped}, checkpoint = ${toPostgresJson({ processed: counts.downloaded, complete: true })}::jsonb
      WHERE id = ${runId}::uuid
    `;
    structured("location_import_completed", { source, runId, counts });
    return { runId, counts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    Object.assign(counts, committedCounts);
    await sqlClient`
      UPDATE location_import_runs SET status = 'failed', completed_at = now(),
        records_downloaded = ${counts.downloaded}, records_accepted = ${counts.accepted},
        records_excluded = ${counts.excluded}, invalid_coordinates = ${counts.invalidCoordinates},
        duplicates_prevented = ${counts.duplicatesPrevented}, records_inserted = ${counts.inserted},
        records_updated = ${counts.updated}, records_unchanged = ${counts.unchanged},
        records_matched = ${counts.matched}, merge_candidates_created = ${counts.mergeCandidates},
        records_skipped = ${counts.skipped},
        errors = ${toPostgresJson([{ message, at: new Date().toISOString() }])}::jsonb,
        checkpoint = ${toPostgresJson({ processed: counts.downloaded })}::jsonb
      WHERE id = ${runId}::uuid
    `;
    structured("location_import_failed", {
      source,
      runId,
      counts,
      error: message,
    });
    throw error;
  }
}
