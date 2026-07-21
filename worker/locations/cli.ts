import { sqlClient } from "@/db";
import { processLocationImport } from "./importer";
import { osmRecords } from "./connectors/osm";
import { ridbRecords } from "./connectors/ridb";
import { npsRecords } from "./connectors/nps";
import { bcRecords } from "./connectors/bc";
import { bcParksRecords } from "./connectors/bc-parks";
import { parksCanadaRecords } from "./connectors/parks-canada";
import { quebecRecords } from "./connectors/quebec";
import { novaScotiaRecords } from "./connectors/nova-scotia";
import { usfsRecords } from "./connectors/usfs";
import { overtureRecords, resolveOvertureRelease } from "./connectors/overture";
import {
  normalizeName,
  type ImportOptions,
  type NormalizedLocation,
} from "./types";
import { processInitialOvertureImport } from "./overture-bootstrap";
import { scanCanonicalDuplicates } from "./duplicate-audit";
import { scanLocationDeletionCandidates } from "./deletion-audit";
import { mergeCanonicalLocations } from "@/lib/location-merge";
import { mergeCanonicalLocationMappings } from "@/lib/location-merge";
import { planAutomaticMergeClusters } from "./automatic-merge-plan";
import { toPostgresJson } from "@/lib/postgres-json";
import {
  backfillEmbeddedCampsiteCounts,
  campsiteCountCoverage,
  refreshRidbCampsiteCounts,
} from "./capacity";
import { cleanupOvertureLocations } from "./overture-cleanup";
import { enrichCanonicalLocalities } from "./locality-enrichment";
import { verifySaskatchewanOvertureCampgrounds } from "./saskatchewan-verification";
import { verifyEstablishedOvertureCampgrounds } from "./overture-verification";
import { auditLocationCoverage, type CoverageGap } from "./coverage-audit";
import { osmOverpassGapRecords } from "./connectors/osm-overpass";
import { verifyEstablishedOsmCampgrounds } from "./osm-verification";

function argumentsMap(values: string[]) {
  return Object.fromEntries(
    values
      .filter((value) => value.startsWith("--"))
      .map((value) => {
        const [key, ...rest] = value.slice(2).split("=");
        return [key, rest.length ? rest.join("=") : "true"];
      }),
  );
}

const command = process.argv[2];
const args = argumentsMap(process.argv.slice(3));
const options: ImportOptions = {
  dryRun: args["dry-run"] === "true",
  limit: args.limit ? Math.max(1, Number(args.limit)) : undefined,
  batchSize: args.batch
    ? Math.max(1, Math.min(1_000, Number(args.batch)))
    : 100,
  country: args.country?.toUpperCase(),
  region: args.region,
  resumeRunId: args.resume,
  datasetVersion: args["dataset-version"],
};

async function runSource(source: NormalizedLocation["source"]) {
  if (source === "overture-ca" || source === "overture-us") {
    const release = options.datasetVersion || (await resolveOvertureRelease());
    const country = source === "overture-ca" ? "CA" : "US";
    return processLocationImport(
      source,
      overtureRecords(country, release, {
        region: options.region,
        limit: options.limit,
      }),
      { ...options, datasetVersion: release },
    );
  }
  if (source === "openstreetmap") {
    const file = args.file || process.env.OSM_EXTRACT_FILE;
    if (!file)
      throw new Error("OSM import requires --file=/path/to/extract.osm.pbf");
    return processLocationImport(
      source,
      osmRecords(file, options.country),
      options,
    );
  }
  if (source === "ridb")
    return processLocationImport(source, ridbRecords(), options);
  if (source === "nps")
    return processLocationImport(source, npsRecords(), options);
  if (source === "bc-recreation")
    return processLocationImport(source, bcRecords(), options);
  if (source === "bc-parks")
    return processLocationImport(source, bcParksRecords(), options);
  if (source === "parks-canada")
    return processLocationImport(source, parksCanadaRecords(), options);
  if (source === "quebec-tourism")
    return processLocationImport(source, quebecRecords(), options);
  if (source === "nova-scotia-parks")
    return processLocationImport(source, novaScotiaRecords(), options);
  if (source === "usfs")
    return processLocationImport(source, usfsRecords(), options);
  throw new Error(`Unsupported location source: ${source}`);
}

async function status() {
  const [sources, summary] = await Promise.all([
    sqlClient`
      SELECT DISTINCT ON (source) source, status, started_at, completed_at,
        records_downloaded, records_inserted, records_updated,
        records_accepted, records_excluded, invalid_coordinates,
        duplicates_prevented,
        records_unchanged, records_matched, merge_candidates_created,
        records_skipped, errors
      FROM location_import_runs ORDER BY source, started_at DESC
    `,
    sqlClient`
      SELECT
        (SELECT count(*)::int FROM campgrounds WHERE active = true) AS active_canonical,
        (SELECT count(*)::int FROM location_source_records) AS source_records,
        (SELECT count(*)::int FROM location_source_records WHERE campground_id IS NULL) AS unmatched_sources,
        (SELECT count(*)::int FROM location_merge_candidates WHERE status = 'pending') AS pending_merge_candidates,
        (SELECT count(*)::int FROM canonical_duplicate_candidates WHERE status = 'pending') AS pending_canonical_duplicates,
        (SELECT count(*)::int FROM location_deletion_candidates WHERE status = 'pending') AS pending_location_deletions
    `,
  ]);
  console.log(JSON.stringify({ summary: summary[0], sources }, null, 2));
}

async function audit() {
  const [
    summary,
    countries,
    sources,
    sourceCoverage,
    jurisdictions,
    reviewSamples,
  ] = await Promise.all([
    sqlClient`
      SELECT
        (SELECT count(*)::int FROM campgrounds WHERE active = true) AS active_canonical,
        (SELECT count(*)::int FROM campgrounds WHERE active = true AND country = 'CA') AS active_canada,
        (SELECT count(*)::int FROM campgrounds WHERE active = true AND country = 'US') AS active_united_states,
        (SELECT count(*)::int FROM campgrounds WHERE active = true AND country = 'CA' AND region = 'BC') AS active_british_columbia,
        (SELECT count(*)::int FROM location_source_records) AS source_records,
        (SELECT count(*)::int FROM location_source_records WHERE source IN ('bc-parks', 'bc-recreation')) AS preserved_bc_source_records,
        (SELECT count(*)::int FROM location_source_records
          WHERE source = 'overture-ca'
            AND upper(coalesce(normalized_payload->>'region', '')) IN ('BC', 'BRITISH COLUMBIA')) AS overture_bc_leaks,
        (SELECT count(*)::int FROM location_source_records WHERE campground_id IS NULL) AS unmatched_sources,
        (SELECT count(*)::int FROM location_merge_candidates WHERE status = 'pending') AS pending_merge_candidates,
        (SELECT count(*)::int FROM location_deletion_candidates WHERE status = 'pending') AS pending_location_deletions,
        (SELECT count(*)::int FROM location_import_runs WHERE status = 'running') AS running_imports
    `,
    sqlClient`
      SELECT country, count(*)::int AS active_campgrounds
      FROM campgrounds
      WHERE active = true
      GROUP BY country
      ORDER BY country
    `,
    sqlClient`
      SELECT DISTINCT ON (source)
        source, status, started_at, completed_at, dataset_version,
        records_downloaded, records_accepted, records_excluded,
        invalid_coordinates, duplicates_prevented, records_inserted,
        records_updated, records_unchanged, records_matched,
        merge_candidates_created, records_skipped
      FROM location_import_runs
      WHERE dry_run = false
      ORDER BY source, started_at DESC
    `,
    sqlClient`
      SELECT source,
        count(*)::int AS source_records,
        count(*) FILTER (WHERE campground_id IS NULL)::int AS unmatched,
        count(*) FILTER (WHERE import_status = 'excluded')::int AS excluded
      FROM location_source_records
      GROUP BY source
      ORDER BY source
    `,
    sqlClient`
      SELECT source,
        normalized_payload->>'country' AS country,
        coalesce(nullif(normalized_payload->>'region', ''), 'unknown') AS region,
        count(*)::int AS accepted_source_records
      FROM location_source_records
      WHERE source NOT IN ('bc-parks', 'bc-recreation')
      GROUP BY source, normalized_payload->>'country',
        coalesce(nullif(normalized_payload->>'region', ''), 'unknown')
      ORDER BY source, country, region
    `,
    sqlClient`
      WITH labelled AS (
        SELECT
          CASE
            WHEN source = 'overture-us' AND normalized_payload->>'region' = 'DC' THEN 'urban-dc'
            WHEN source = 'overture-us' AND normalized_payload->>'region' = 'AK' THEN 'northern-alaska'
            WHEN source = 'overture-ca' AND normalized_payload->>'region' = 'YT' THEN 'northern-yukon'
            WHEN source = 'overture-ca' AND normalized_payload->>'region' = 'NT' THEN 'remote-northwest-territories'
            WHEN source = 'usfs' THEN 'rural-federal'
          END AS sample,
          source, external_id,
          normalized_payload->>'name' AS name,
          normalized_payload->>'region' AS region,
          normalized_payload->>'locality' AS locality,
          row_number() OVER (
            PARTITION BY CASE
              WHEN source = 'overture-us' AND normalized_payload->>'region' = 'DC' THEN 'urban-dc'
              WHEN source = 'overture-us' AND normalized_payload->>'region' = 'AK' THEN 'northern-alaska'
              WHEN source = 'overture-ca' AND normalized_payload->>'region' = 'YT' THEN 'northern-yukon'
              WHEN source = 'overture-ca' AND normalized_payload->>'region' = 'NT' THEN 'remote-northwest-territories'
              WHEN source = 'usfs' THEN 'rural-federal'
            END
            ORDER BY external_id
          ) AS sample_number
        FROM location_source_records
        WHERE source = 'usfs'
          OR (source = 'overture-us' AND normalized_payload->>'region' IN ('AK', 'DC'))
          OR (source = 'overture-ca' AND normalized_payload->>'region' IN ('NT', 'YT'))
      )
      SELECT sample, source, external_id, name, region, locality
      FROM labelled
      WHERE sample_number = 1
      ORDER BY sample
    `,
  ]);
  console.log(
    JSON.stringify(
      {
        summary: summary[0],
        countries,
        sourceCoverage,
        jurisdictions,
        reviewSamples,
        sources,
      },
      null,
      2,
    ),
  );
}

async function candidates() {
  const rows = await sqlClient`
    SELECT m.id, s.source, s.external_id,
      s.normalized_payload->>'name' AS source_name,
      c.name AS suggested_name, m.match_score, m.distance_meters, m.reasons
    FROM location_merge_candidates m
    JOIN location_source_records s ON s.id = m.source_record_id
    JOIN campgrounds c ON c.id = m.suggested_campground_id
    WHERE m.status = 'pending'
    ORDER BY m.match_score DESC, m.created_at
  `;
  console.log(JSON.stringify(rows, null, 2));
}

async function reconcileInterruptedRuns() {
  const rows = await sqlClient`
    UPDATE location_import_runs
    SET status = 'partial',
        completed_at = now(),
        errors = errors || jsonb_build_array(
          jsonb_build_object(
            'message',
            'Import process stopped after its last committed checkpoint; a later idempotent run may supersede it.'
          )
        )
    WHERE status = 'running'
      AND started_at < now() - interval '5 minutes'
    RETURNING id, source, started_at
  `;
  console.log(JSON.stringify({ reconciled: rows }, null, 2));
}

async function duplicateAudit() {
  const result = await scanCanonicalDuplicates({
    maxDistanceMeters: args["max-distance"]
      ? Number(args["max-distance"])
      : 2_000,
    country: options.country,
    region: options.region,
    persist: !options.dryRun,
  });
  const limit = args.limit ? Math.max(1, Number(args.limit)) : 100;
  console.log(
    JSON.stringify(
      {
        scanned: result.scanned,
        total: result.detected,
        automatic: result.automatic,
        review: result.review,
        persisted: result.persisted,
        staleRemoved: result.staleRemoved,
        clusters: result.clusters,
        dryRun: options.dryRun,
        candidates: result.candidates.slice(0, limit),
      },
      null,
      2,
    ),
  );
}

async function deletionAudit() {
  const result = await scanLocationDeletionCandidates({
    persist: !options.dryRun,
  });
  const limit = args.limit ? Math.max(1, Number(args.limit)) : 100;
  console.log(
    JSON.stringify(
      {
        scanned: result.scanned,
        detected: result.detected,
        persisted: result.persisted,
        staleRemoved: result.staleRemoved,
        dryRun: options.dryRun,
        candidates: result.candidates.slice(0, limit),
      },
      null,
      2,
    ),
  );
}

async function scanAfterRefresh() {
  if (options.dryRun) return;
  const result = await scanCanonicalDuplicates({
    country: options.country,
    region: options.region,
    persist: true,
  });
  console.log(
    JSON.stringify({
      event: "canonical_duplicate_scan_completed",
      scanned: result.scanned,
      detected: result.detected,
      automatic: result.automatic,
      review: result.review,
      persisted: result.persisted,
      staleRemoved: result.staleRemoved,
    }),
  );
  const deletionResult = await scanLocationDeletionCandidates({
    persist: true,
  });
  console.log(
    JSON.stringify({
      event: "location_deletion_scan_completed",
      scanned: deletionResult.scanned,
      detected: deletionResult.detected,
      persisted: deletionResult.persisted,
      staleRemoved: deletionResult.staleRemoved,
    }),
  );
}

async function latestCoverageGaps() {
  const rows = await sqlClient<Array<{ checkpoint: { gaps?: CoverageGap[] } }>>`
    SELECT checkpoint FROM location_import_runs
    WHERE source = 'coverage-audit' AND status = 'completed'
    ORDER BY completed_at DESC NULLS LAST LIMIT 1
  `;
  return rows[0]?.checkpoint?.gaps || [];
}

async function fillCoverageGapsFromOsm(input?: CoverageGap[]) {
  const maximumGaps = args.gaps ? Math.max(1, Number(args.gaps)) : 40;
  const gaps = [...(input || (await latestCoverageGaps()))]
    .sort(
      (left, right) =>
        Number(left.classification === "publication_gap") -
          Number(right.classification === "publication_gap") ||
        right.population - left.population,
    )
    .slice(0, maximumGaps);
  if (!gaps.length)
    throw new Error(
      "No stored coverage gaps exist. Run locations:audit-coverage first.",
    );
  const imported = await processLocationImport(
    "openstreetmap",
    osmOverpassGapRecords(gaps),
    {
      ...options,
      limit: options.limit || 10_000,
      datasetVersion: new Date().toISOString().slice(0, 10),
    },
  );
  const verification = await verifyEstablishedOsmCampgrounds({
    apply: !options.dryRun,
  });
  if (!options.dryRun) {
    await enrichCanonicalLocalities();
    await scanAfterRefresh();
  }
  return { gapsQueried: gaps.length, imported, verification };
}

async function auditAndFillCoverage() {
  const coverage = await auditLocationCoverage();
  if (process.env.OSM_GAP_FILL_ENABLED === "false") return coverage;
  try {
    await fillCoverageGapsFromOsm(coverage.gaps);
    return await auditLocationCoverage();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "osm_gap_fill_failed",
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    return coverage;
  }
}

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function maintenanceActorId() {
  const actors = await sqlClient<{ id: string }[]>`
    SELECT id FROM "user" ORDER BY created_at LIMIT 2
  `;
  if (actors.length !== 1)
    throw new Error(
      "A maintenance action requires exactly one local account or an explicit admin review",
    );
  return actors[0].id;
}

async function mergeDuplicate() {
  const survivorId = args.survivor;
  const duplicateId = args.duplicate;
  if (!survivorId || !duplicateId)
    throw new Error(
      "Duplicate merge requires --survivor=<uuid> and --duplicate=<uuid>",
    );
  if (!uuidPattern.test(survivorId) || !uuidPattern.test(duplicateId))
    throw new Error("Duplicate merge IDs must be valid UUIDs");
  const actorId = await maintenanceActorId();
  const result = await mergeCanonicalLocations(
    survivorId,
    duplicateId,
    actorId,
  );
  console.log(JSON.stringify(result));
}

async function mergeAutomaticDuplicates() {
  const scan = await scanCanonicalDuplicates({ persist: !options.dryRun });
  const clusters = planAutomaticMergeClusters(scan.candidates);
  const duplicateCount = clusters.reduce(
    (total, cluster) => total + cluster.duplicates.length,
    0,
  );
  if (options.dryRun) {
    console.log(
      JSON.stringify({
        dryRun: true,
        scanned: scan.scanned,
        automaticPairs: scan.automatic,
        clusters: clusters.length,
        locationsToMerge: duplicateCount,
        largestCluster: Math.max(
          0,
          ...clusters.map((cluster) => cluster.duplicates.length + 1),
        ),
      }),
    );
    return;
  }

  const actorId = await maintenanceActorId();
  const batchSize = options.batchSize ?? 100;
  let merged = 0;
  let survivorCount = 0;
  let batch: Array<{ survivorId: string; duplicateId: string }> = [];
  const flush = async () => {
    if (!batch.length) return;
    const result = await mergeCanonicalLocationMappings(batch, actorId);
    merged += result.merged;
    survivorCount += result.survivorCount;
    console.log(
      JSON.stringify({
        event: "automatic_duplicate_merge_progress",
        merged,
        total: duplicateCount,
      }),
    );
    batch = [];
  };
  for (const cluster of clusters) {
    if (batch.length && batch.length + cluster.duplicates.length > batchSize)
      await flush();
    batch.push(
      ...cluster.duplicates.map((duplicate) => ({
        survivorId: cluster.survivor.id,
        duplicateId: duplicate.id,
      })),
    );
    if (batch.length >= batchSize) await flush();
  }
  await flush();
  console.log(
    JSON.stringify({
      event: "automatic_duplicate_merge_completed",
      automaticPairs: scan.automatic,
      clusters: clusters.length,
      merged,
      survivorCount,
    }),
  );
}

async function enrichCampsiteCapacity() {
  if (options.dryRun) {
    console.log(
      JSON.stringify({ dryRun: true, coverage: await campsiteCountCoverage() }),
    );
    return;
  }
  const embeddedUpdated = await backfillEmbeddedCampsiteCounts();
  const ridb =
    args["skip-ridb"] === "true"
      ? null
      : await refreshRidbCampsiteCounts({
          limit: options.limit,
          batchSize: options.batchSize,
          concurrency: args.concurrency ? Number(args.concurrency) : 2,
          staleDays: args["stale-days"] ? Number(args["stale-days"]) : 30,
        });
  console.log(
    JSON.stringify({
      event: "campsite_capacity_enrichment_completed",
      embeddedUpdated,
      ridb,
      coverage: await campsiteCountCoverage(),
    }),
  );
}

async function verifyCanonicalLocation() {
  const id = args.id;
  if (!id || !uuidPattern.test(id))
    throw new Error("Location verification requires --id=<uuid>");
  const changes = Object.fromEntries(
    ["name", "city", "region", "address", "website"]
      .filter((field) => args[field])
      .map((field) => [field, args[field]]),
  );
  if (!Object.keys(changes).length)
    throw new Error("Location verification requires at least one detail field");
  const actorId = await maintenanceActorId();
  const provenance = Object.fromEntries(
    Object.keys(changes).map((field) => [field, ["manual-verification", 100]]),
  );
  await sqlClient.begin(async (tx) => {
    const updated = await tx<{ id: string }[]>`
      UPDATE campgrounds SET
        name = coalesce(${changes.name || null}, name),
        normalized_name = CASE WHEN ${changes.name || null}::text IS NULL
          THEN normalized_name ELSE ${normalizeName(changes.name || "")} END,
        city = coalesce(${changes.city || null}, city),
        region = coalesce(${changes.region || null}, region),
        address = coalesce(${changes.address || null}, address),
        website = coalesce(${changes.website || null}, website),
        verification_status = 'manually_verified',
        manual_locks = ARRAY(
          SELECT DISTINCT unnest(manual_locks || ${Object.keys(changes)}::text[])
        ),
        field_provenance = field_provenance || ${toPostgresJson(provenance)}::jsonb,
        updated_at = now()
      WHERE id = ${id}::uuid
      RETURNING id
    `;
    if (!updated[0]) throw new Error("Canonical campground was not found");
    await tx`
      INSERT INTO admin_audit_logs (
        actor_id, action, target_type, target_id, details
      ) VALUES (
        ${actorId}, 'verify_canonical_location', 'campground', ${id},
        ${toPostgresJson({ changedFields: Object.keys(changes) })}::jsonb
      )
    `;
  });
  console.log(JSON.stringify({ id, changedFields: Object.keys(changes) }));
}

try {
  if (command === "osm") await runSource("openstreetmap");
  else if (
    command === "overture-bootstrap-ca" ||
    command === "overture-bootstrap-us"
  ) {
    if (options.dryRun)
      throw new Error(
        "Overture bootstrap is production-only; use the normal Overture command for dry runs",
      );
    const country = command.endsWith("-ca") ? "CA" : "US";
    const source = country === "CA" ? "overture-ca" : "overture-us";
    const release = options.datasetVersion || (await resolveOvertureRelease());
    await processInitialOvertureImport(
      source,
      overtureRecords(country, release, { region: options.region }),
      release,
      options.batchSize,
    );
  } else if (command === "overture-ca") await runSource("overture-ca");
  else if (command === "ridb-bootstrap") {
    if (options.dryRun)
      throw new Error(
        "RIDB bootstrap is production-only; use the normal RIDB command for dry runs",
      );
    await processInitialOvertureImport(
      "ridb",
      ridbRecords(),
      options.datasetVersion || new Date().toISOString().slice(0, 10),
      options.batchSize,
    );
  } else if (command === "usfs-bootstrap") {
    if (options.dryRun)
      throw new Error(
        "USFS bootstrap is production-only; use the normal USFS command for dry runs",
      );
    await processInitialOvertureImport(
      "usfs",
      usfsRecords(),
      options.datasetVersion || new Date().toISOString().slice(0, 10),
      options.batchSize,
    );
  } else if (command === "overture-us") await runSource("overture-us");
  else if (command === "ridb") await runSource("ridb");
  else if (command === "nps") await runSource("nps");
  else if (command === "bc") await runSource("bc-recreation");
  else if (command === "bc-parks") await runSource("bc-parks");
  else if (command === "parks-canada") await runSource("parks-canada");
  else if (command === "quebec") await runSource("quebec-tourism");
  else if (command === "nova-scotia") await runSource("nova-scotia-parks");
  else if (command === "usfs") await runSource("usfs");
  else if (command === "status") await status();
  else if (command === "audit") await audit();
  else if (command === "coverage-gaps")
    console.log(
      JSON.stringify(
        await auditLocationCoverage({ dryRun: options.dryRun }),
        null,
        2,
      ),
    );
  else if (command === "fill-gaps-osm") {
    const result = await fillCoverageGapsFromOsm();
    const coverage = options.dryRun ? null : await auditLocationCoverage();
    console.log(JSON.stringify({ result, coverage }, null, 2));
  } else if (command === "duplicates") await duplicateAudit();
  else if (command === "deletions") await deletionAudit();
  else if (command === "cleanup-overture") {
    const result = await cleanupOvertureLocations({
      apply: args.apply === "true",
      batchSize: options.batchSize,
      fullVacuum: args["full-vacuum"] === "true",
    });
    console.log(JSON.stringify(result, null, 2));
  } else if (command === "merge") await mergeDuplicate();
  else if (command === "merge-automatic") await mergeAutomaticDuplicates();
  else if (command === "enrich-capacity") await enrichCampsiteCapacity();
  else if (command === "enrich-localities")
    console.log(JSON.stringify(await enrichCanonicalLocalities(), null, 2));
  else if (command === "verify-saskatchewan")
    console.log(
      JSON.stringify(await verifySaskatchewanOvertureCampgrounds(), null, 2),
    );
  else if (command === "verify-overture")
    console.log(
      JSON.stringify(
        await verifyEstablishedOvertureCampgrounds({
          apply: args.apply === "true",
        }),
        null,
        2,
      ),
    );
  else if (command === "verify") await verifyCanonicalLocation();
  else if (command === "reconcile") await reconcileInterruptedRuns();
  else if (command === "candidates") await candidates();
  else if (command === "weekly") {
    await runSource("parks-canada");
    await runSource("quebec-tourism");
    if (process.env.RIDB_API_KEY || process.env.RIDB_BULK_FILE)
      await runSource("ridb");
    if (process.env.RIDB_API_KEY) await enrichCampsiteCapacity();
    await runSource("usfs");
    await enrichCanonicalLocalities();
    if (process.env.NPS_API_KEY) await runSource("nps");
    await scanAfterRefresh();
  } else if (command === "monthly") {
    await runSource("overture-ca");
    await runSource("overture-us");
    await verifyEstablishedOvertureCampgrounds({ apply: true });
    await runSource("nova-scotia-parks");
    await scanAfterRefresh();
    await auditAndFillCoverage();
  } else if (command === "all" || command === "refresh") {
    await runSource("overture-ca");
    await runSource("overture-us");
    await verifyEstablishedOvertureCampgrounds({ apply: true });
    await runSource("parks-canada");
    await runSource("quebec-tourism");
    await runSource("nova-scotia-parks");
    if (process.env.RIDB_API_KEY || process.env.RIDB_BULK_FILE)
      await runSource("ridb");
    if (process.env.RIDB_API_KEY) await enrichCampsiteCapacity();
    await runSource("usfs");
    await enrichCanonicalLocalities();
    if (process.env.NPS_API_KEY) await runSource("nps");
    await scanAfterRefresh();
    await auditAndFillCoverage();
  } else {
    throw new Error(`Unknown locations command: ${command || "missing"}`);
  }
} finally {
  await sqlClient.end();
}
