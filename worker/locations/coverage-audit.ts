import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { toPostgresJson } from "@/lib/postgres-json";

const MINIMUM_POPULATION = 10_000;
const MAX_STORED_GAPS = 250;

type PopulatedPlace = {
  geonameId: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  population: number;
};

export type CoverageGap = PopulatedPlace & {
  kind: "populated_place" | "staged_cluster";
  expectedRadiusKm: number;
  nearestPublicId: string | null;
  nearestPublicName: string | null;
  nearestPublicDistanceKm: number | null;
  stagedCandidateCount: number;
  classification: "source_gap" | "publication_gap";
  sampleCandidates: string[];
};

type CoverageRow = {
  geonameId: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  population: number;
  expectedRadiusKm: number;
  nearest_public_id: string | null;
  nearest_public_name: string | null;
  nearest_public_distance_km: number | null;
  staged_candidate_count: number;
  sample_candidates: string[];
};

type StagedClusterRow = {
  geoname_id: string;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  region: string;
  candidate_count: number;
  sample_candidates: string[];
  nearest_public_id: string | null;
  nearest_public_name: string | null;
  nearest_public_distance_km: number | null;
};

function expectedRadiusKm(population: number) {
  if (population >= 250_000) return 35;
  if (population >= 100_000) return 45;
  if (population >= 25_000) return 60;
  return 75;
}

async function populatedPlaces() {
  const script = fileURLToPath(
    new URL("./coverage-geonames.py", import.meta.url),
  );
  const python = process.env.PYTHON_EXECUTABLE || "python";
  const child = spawn(
    python,
    [script, "data/locations/geonames", String(MINIMUM_POPULATION)],
    { stdio: ["ignore", "pipe", "inherit"] },
  );
  const places: PopulatedPlace[] = [];
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  for await (const line of lines)
    places.push(JSON.parse(line) as PopulatedPlace);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0)
    throw new Error(`GeoNames coverage process exited with code ${exitCode}`);
  return places;
}

async function inspectPlaces(places: PopulatedPlace[]) {
  const { sqlClient } = await import("@/db");
  const output: CoverageGap[] = [];
  for (let offset = 0; offset < places.length; offset += 250) {
    const input = places.slice(offset, offset + 250).map((place) => ({
      ...place,
      expectedRadiusKm: expectedRadiusKm(place.population),
    }));
    const rows = await sqlClient<CoverageRow[]>`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${toPostgresJson(input)}::jsonb)
          AS value(
            "geonameId" text, name text, latitude double precision,
            longitude double precision, country text, region text,
            population integer, "expectedRadiusKm" integer
          )
      ), origins AS (
        SELECT input.*, extensions.st_setsrid(
          extensions.st_makepoint(longitude, latitude), 4326
        ) AS origin
        FROM input
      )
      SELECT origin."geonameId", origin.name, origin.latitude,
        origin.longitude, origin.country, origin.region, origin.population,
        origin."expectedRadiusKm",
        nearest.id AS nearest_public_id,
        nearest.name AS nearest_public_name,
        nearest.distance_km AS nearest_public_distance_km,
        coalesce(staged.candidate_count, 0)::int AS staged_candidate_count,
        coalesce(staged.sample_names, ARRAY[]::text[]) AS sample_candidates
      FROM origins origin
      LEFT JOIN LATERAL (
        SELECT c.id, c.name, extensions.st_distance(
          c.point::geography, origin.origin::geography
        ) / 1000 AS distance_km
        FROM campgrounds c
        WHERE c.active = true AND c.operational_status <> 'closed'
          AND c.verification_status <> 'unverified'
        ORDER BY c.point <-> origin.origin
        LIMIT 1
      ) nearest ON true
      LEFT JOIN LATERAL (
        SELECT count(DISTINCT c.id)::int AS candidate_count,
          (array_agg(DISTINCT c.name ORDER BY c.name))[1:5] AS sample_names
        FROM location_source_records lsr
        JOIN campgrounds c ON c.id = lsr.campground_id
        WHERE lsr.source IN ('overture-ca', 'overture-us')
          AND lsr.import_status = 'accepted'
          AND nullif(lsr.raw_payload->>'confidence', '')::double precision >= 0.80
          AND c.active = true AND c.verification_status = 'unverified'
          AND lsr.representative_point && extensions.st_expand(
            origin.origin, origin."expectedRadiusKm" / 50.0
          )
          AND extensions.st_dwithin(
            lsr.representative_point::geography, origin.origin::geography,
            origin."expectedRadiusKm" * 1000
          )
      ) staged ON true
      ORDER BY origin.population DESC
    `;
    for (const row of rows) {
      const nearestDistance = row.nearest_public_distance_km;
      if (
        nearestDistance !== null &&
        Number(nearestDistance) <= row.expectedRadiusKm
      )
        continue;
      output.push({
        geonameId: row.geonameId,
        name: row.name,
        latitude: Number(row.latitude),
        longitude: Number(row.longitude),
        country: row.country,
        region: row.region,
        population: Number(row.population),
        kind: "populated_place",
        expectedRadiusKm: Number(row.expectedRadiusKm),
        nearestPublicId: row.nearest_public_id,
        nearestPublicName: row.nearest_public_name,
        nearestPublicDistanceKm:
          nearestDistance === null ? null : Math.round(Number(nearestDistance)),
        stagedCandidateCount: Number(row.staged_candidate_count),
        classification:
          Number(row.staged_candidate_count) > 0
            ? "publication_gap"
            : "source_gap",
        sampleCandidates: row.sample_candidates || [],
      });
    }
    console.log(
      JSON.stringify({
        event: "location_coverage_audit_progress",
        placesProcessed: Math.min(offset + input.length, places.length),
        placesTotal: places.length,
        gapsDetected: output.length,
      }),
    );
  }
  return output;
}

/**
 * Find rural 0.5-degree cells where several strong Overture records are still
 * staged and no published campground exists within 50 km of their centroid.
 * This catches gaps outside the populated-place denominator.
 */
async function inspectStagedClusters() {
  const { sqlClient } = await import("@/db");
  const rows = await sqlClient<StagedClusterRow[]>`
    WITH overture_evidence AS (
      SELECT c.id, c.name, c.country, c.region, c.latitude, c.longitude,
        max(nullif(lsr.raw_payload->>'confidence', '')::double precision) AS confidence
      FROM campgrounds c
      JOIN location_source_records lsr ON lsr.campground_id = c.id
      WHERE c.active = true AND c.verification_status = 'unverified'
        AND lsr.source IN ('overture-ca', 'overture-us')
        AND lsr.import_status = 'accepted'
      GROUP BY c.id
    ), cells AS (
      SELECT country, region,
        floor(latitude * 2) / 2 AS latitude_cell,
        floor(longitude * 2) / 2 AS longitude_cell,
        avg(latitude)::double precision AS latitude,
        avg(longitude)::double precision AS longitude,
        count(*)::int AS candidate_count,
        (array_agg(name ORDER BY confidence DESC, name))[1:5] AS sample_candidates
      FROM overture_evidence
      WHERE confidence >= 0.80
      GROUP BY country, region, floor(latitude * 2), floor(longitude * 2)
      HAVING count(*) >= 3
    ), origins AS (
      SELECT cells.*, extensions.st_setsrid(
        extensions.st_makepoint(longitude, latitude), 4326
      ) AS origin
      FROM cells
    )
    SELECT concat(
        'cluster:', country, ':', region, ':', latitude_cell, ':', longitude_cell
      ) AS geoname_id,
      concat(coalesce(nullif(region, ''), country), ' campground candidate cluster') AS name,
      latitude, longitude, country, region, candidate_count, sample_candidates,
      nearest.id AS nearest_public_id,
      nearest.name AS nearest_public_name,
      nearest.distance_km AS nearest_public_distance_km
    FROM origins
    LEFT JOIN LATERAL (
      SELECT c.id, c.name, extensions.st_distance(
        c.point::geography, origins.origin::geography
      ) / 1000 AS distance_km
      FROM campgrounds c
      WHERE c.active = true AND c.operational_status <> 'closed'
        AND c.verification_status <> 'unverified'
      ORDER BY c.point <-> origins.origin
      LIMIT 1
    ) nearest ON true
    WHERE nearest.distance_km IS NULL OR nearest.distance_km > 50
    ORDER BY candidate_count DESC, country, region
  `;
  return rows.map((row): CoverageGap => ({
    geonameId: row.geoname_id,
    name: row.name,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    country: row.country,
    region: row.region,
    population: 0,
    kind: "staged_cluster",
    expectedRadiusKm: 50,
    nearestPublicId: row.nearest_public_id,
    nearestPublicName: row.nearest_public_name,
    nearestPublicDistanceKm:
      row.nearest_public_distance_km === null
        ? null
        : Math.round(Number(row.nearest_public_distance_km)),
    stagedCandidateCount: Number(row.candidate_count),
    classification: "publication_gap",
    sampleCandidates: row.sample_candidates || [],
  }));
}

function distanceKm(left: CoverageGap, right: CoverageGap) {
  const radians = Math.PI / 180;
  const dLatitude = (right.latitude - left.latitude) * radians;
  const dLongitude = (right.longitude - left.longitude) * radians;
  const first = left.latitude * radians;
  const second = right.latitude * radians;
  const value =
    Math.sin(dLatitude / 2) ** 2 +
    Math.cos(first) * Math.cos(second) * Math.sin(dLongitude / 2) ** 2;
  return 6_371.0088 * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

/** Collapse adjacent suburbs so the report ranks regions, not every municipality. */
export function representativeCoverageGaps(gaps: CoverageGap[]) {
  const selected: CoverageGap[] = [];
  for (const gap of [...gaps].sort(
    (a, b) =>
      b.population - a.population ||
      b.stagedCandidateCount - a.stagedCandidateCount,
  )) {
    const overlaps = selected.some(
      (existing) =>
        existing.country === gap.country && distanceKm(existing, gap) <= 30,
    );
    if (!overlaps) selected.push(gap);
  }
  return selected;
}

function countsBy<T extends string>(
  values: CoverageGap[],
  key: (gap: CoverageGap) => T,
) {
  return Object.fromEntries(
    [
      ...values
        .reduce((counts, gap) => {
          const value = key(gap);
          counts.set(value, (counts.get(value) ?? 0) + 1);
          return counts;
        }, new Map<T, number>())
        .entries(),
    ].sort(([left], [right]) => left.localeCompare(right)),
  );
}

export async function auditLocationCoverage({ dryRun = false } = {}) {
  const places = await populatedPlaces();
  const [populatedPlaceGaps, stagedClusterGaps] = await Promise.all([
    inspectPlaces(places),
    inspectStagedClusters(),
  ]);
  const rawGaps = [...populatedPlaceGaps, ...stagedClusterGaps];
  const gaps = representativeCoverageGaps(rawGaps);
  const summary = {
    placesExamined: places.length,
    populatedPlaceGapCount: populatedPlaceGaps.length,
    stagedClusterGapCount: stagedClusterGaps.length,
    rawGapCount: rawGaps.length,
    representativeGapCount: gaps.length,
    byClassification: countsBy(gaps, (gap) => gap.classification),
    byJurisdiction: countsBy(gaps, (gap) => `${gap.country}-${gap.region}`),
  };
  const storedGaps = gaps.slice(0, MAX_STORED_GAPS);
  if (!dryRun) {
    const { sqlClient } = await import("@/db");
    await sqlClient`
      INSERT INTO location_import_runs (
        source, status, dataset_version, started_at, completed_at,
        records_downloaded, records_accepted, records_excluded,
        checkpoint, options, dry_run
      ) VALUES (
        'coverage-audit', 'completed', 'geonames-cities500-v1', now(), now(),
        ${places.length}, ${gaps.length}, ${rawGaps.length - gaps.length},
        ${toPostgresJson({ summary, gaps: storedGaps })}::jsonb,
        ${toPostgresJson({
          minimumPopulation: MINIMUM_POPULATION,
          radiiKm: { over250k: 35, over100k: 45, over25k: 60, over10k: 75 },
        })}::jsonb,
        false
      )
    `;
  }
  return { dryRun, summary, gaps: storedGaps };
}
