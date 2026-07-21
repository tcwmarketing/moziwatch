import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";

type UnknownLocation = {
  id: string;
  country: string;
  latitude: number;
  longitude: number;
};

type DerivedLocation = {
  id: string;
  city: string;
  region: string;
  distanceKm: number;
};

async function repairUsfsLongitudeSigns() {
  const sourceRows = await sqlClient<{ updated: number }[]>`
    WITH changed AS (
      UPDATE location_source_records lsr SET
        representative_point = extensions.st_setsrid(extensions.st_makepoint(
          -extensions.st_x(lsr.representative_point),
          extensions.st_y(lsr.representative_point)
        ), 4326),
        source_geometry = jsonb_set(
          lsr.source_geometry,
          '{coordinates,0}',
          to_jsonb(-extensions.st_x(lsr.representative_point)),
          false
        ),
        updated_at = now()
      WHERE lsr.source = 'usfs'
        AND extensions.st_x(lsr.representative_point) > 0
      RETURNING lsr.campground_id
    )
    SELECT count(*)::int AS updated FROM changed
  `;
  const canonicalRows = await sqlClient<{ updated: number }[]>`
    WITH changed AS (
      UPDATE campgrounds c SET
        longitude = -c.longitude,
        source_geometry = CASE
          WHEN c.source_geometry->>'type' = 'Point'
            THEN jsonb_set(c.source_geometry, '{coordinates,0}',
              to_jsonb(-c.longitude), false)
          ELSE c.source_geometry
        END,
        updated_at = now()
      WHERE c.longitude > 0 AND c.country = 'US'
        AND EXISTS (
          SELECT 1 FROM location_source_records lsr
          WHERE lsr.campground_id = c.id AND lsr.source = 'usfs'
        )
        AND NOT ('coordinates' = ANY(c.manual_locks))
      RETURNING c.id
    )
    SELECT count(*)::int AS updated FROM changed
  `;
  return {
    sourceRecords: sourceRows[0]?.updated ?? 0,
    campgrounds: canonicalRows[0]?.updated ?? 0,
  };
}

async function deactivateMissingCoordinateRecords() {
  const rows = await sqlClient<{ deactivated: number }[]>`
    WITH changed AS (
      UPDATE campgrounds c SET active = false, updated_at = now()
      WHERE c.active = true AND c.latitude = 0 AND c.longitude = 0
        AND NOT ('coordinates' = ANY(c.manual_locks))
        AND NOT EXISTS (
          SELECT 1 FROM reports r
          WHERE r.campground_id = c.id AND r.deleted_at IS NULL
        )
      RETURNING c.id
    )
    SELECT count(*)::int AS deactivated FROM changed
  `;
  return rows[0]?.deactivated ?? 0;
}

async function fillFromLinkedSources() {
  const rows = await sqlClient<{ updated: number }[]>`
    WITH best_region AS (
      SELECT DISTINCT ON (lsr.campground_id)
        lsr.campground_id, lsr.source, lsr.source_priority,
        lsr.normalized_payload->>'region' AS value
      FROM location_source_records lsr
      WHERE lsr.campground_id IS NOT NULL
        AND coalesce(lsr.normalized_payload->>'region', '') NOT IN ('', 'Unknown')
      ORDER BY lsr.campground_id, lsr.source_priority DESC, lsr.updated_at DESC
    ), best_city AS (
      SELECT DISTINCT ON (lsr.campground_id)
        lsr.campground_id, lsr.source, lsr.source_priority,
        lsr.normalized_payload->>'locality' AS value
      FROM location_source_records lsr
      WHERE lsr.campground_id IS NOT NULL
        AND coalesce(lsr.normalized_payload->>'locality', '') NOT IN ('', 'Unknown')
      ORDER BY lsr.campground_id, lsr.source_priority DESC, lsr.updated_at DESC
    ), changed AS (
      UPDATE campgrounds c SET
        city = CASE
          WHEN c.city = 'Unknown' AND NOT ('city' = ANY(c.manual_locks))
            THEN coalesce(best_city.value, c.city)
          ELSE c.city
        END,
        region = CASE
          WHEN c.region = 'Unknown' AND NOT ('region' = ANY(c.manual_locks))
            THEN coalesce(best_region.value, c.region)
          ELSE c.region
        END,
        field_provenance =
          CASE WHEN c.city = 'Unknown' AND best_city.value IS NOT NULL
            AND NOT ('city' = ANY(c.manual_locks))
            THEN jsonb_set(c.field_provenance, '{city}',
              jsonb_build_array(best_city.source, best_city.source_priority), true)
            ELSE c.field_provenance END
          || CASE WHEN c.region = 'Unknown' AND best_region.value IS NOT NULL
            AND NOT ('region' = ANY(c.manual_locks))
            THEN jsonb_build_object('region',
              jsonb_build_array(best_region.source, best_region.source_priority))
            ELSE '{}'::jsonb END,
        updated_at = now()
      FROM best_region FULL JOIN best_city
        ON best_city.campground_id = best_region.campground_id
      WHERE c.id = coalesce(best_region.campground_id, best_city.campground_id)
        AND ((c.city = 'Unknown' AND best_city.value IS NOT NULL
              AND NOT ('city' = ANY(c.manual_locks)))
          OR (c.region = 'Unknown' AND best_region.value IS NOT NULL
              AND NOT ('region' = ANY(c.manual_locks))))
      RETURNING c.id
    )
    SELECT count(*)::int AS updated FROM changed
  `;
  return rows[0]?.updated ?? 0;
}

async function removeLegacyNearPrefixes() {
  const rows = await sqlClient<{ updated: number }[]>`
    WITH changed AS (
      UPDATE campgrounds c SET
        city = regexp_replace(c.city, '^Near\\s+', '', 'i'),
        updated_at = now()
      WHERE c.city ~* '^Near\\s+'
      RETURNING c.id
    )
    SELECT count(*)::int AS updated FROM changed
  `;
  return rows[0]?.updated ?? 0;
}

async function geonamesLookup(locations: UnknownLocation[]) {
  if (!locations.length) return [];
  const script = fileURLToPath(
    new URL("./reverse-geonames.py", import.meta.url),
  );
  const python = process.env.PYTHON_EXECUTABLE || "python";
  const child = spawn(python, [script, "data/locations/geonames"], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  const derived: DerivedLocation[] = [];
  const lines = createInterface({ input: child.stdout });
  lines.on("line", (line) => derived.push(JSON.parse(line) as DerivedLocation));
  for (const location of locations)
    child.stdin.write(`${JSON.stringify(location)}\n`);
  child.stdin.end();
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  if (exitCode !== 0)
    throw new Error(`GeoNames locality process exited with code ${exitCode}`);
  return derived;
}

async function applyDerivedLocations(locations: DerivedLocation[]) {
  let updated = 0;
  for (let start = 0; start < locations.length; start += 500) {
    const batch = locations.slice(start, start + 500);
    const rows = await sqlClient<{ updated: number }[]>`
      WITH input AS (
        SELECT * FROM jsonb_to_recordset(${toPostgresJson(batch)}::jsonb)
          AS value(id uuid, city text, region text, "distanceKm" double precision)
      ), changed AS (
        UPDATE campgrounds c SET
          city = CASE
            WHEN c.city = 'Unknown' AND NOT ('city' = ANY(c.manual_locks))
              THEN input.city ELSE c.city END,
          region = CASE
            WHEN c.region = 'Unknown' AND NOT ('region' = ANY(c.manual_locks))
              THEN input.region ELSE c.region END,
          field_provenance = c.field_provenance
            || CASE WHEN c.city = 'Unknown' AND NOT ('city' = ANY(c.manual_locks))
              THEN jsonb_build_object('city', jsonb_build_array('geonames-cities500', 70))
              ELSE '{}'::jsonb END
            || CASE WHEN c.region = 'Unknown' AND NOT ('region' = ANY(c.manual_locks))
              THEN jsonb_build_object('region', jsonb_build_array('geonames-cities500', 70))
              ELSE '{}'::jsonb END,
          updated_at = now()
        FROM input
        WHERE c.id = input.id
          AND ((c.city = 'Unknown' AND NOT ('city' = ANY(c.manual_locks)))
            OR (c.region = 'Unknown' AND NOT ('region' = ANY(c.manual_locks))))
        RETURNING c.id
      )
      SELECT count(*)::int AS updated FROM changed
    `;
    updated += rows[0]?.updated ?? 0;
  }
  return updated;
}

export async function enrichCanonicalLocalities() {
  const removedLegacyNearPrefixes = await removeLegacyNearPrefixes();
  const repairedUsfsLongitudeSigns = await repairUsfsLongitudeSigns();
  const deactivatedMissingCoordinates =
    await deactivateMissingCoordinateRecords();
  const linkedSourceUpdates = await fillFromLinkedSources();
  const unknown = await sqlClient<UnknownLocation[]>`
    SELECT id, country, latitude, longitude
    FROM campgrounds
    WHERE active = true AND country IN ('US', 'CA')
      AND (city = 'Unknown' OR region = 'Unknown')
      AND verification_status <> 'unverified'
    ORDER BY id
  `;
  const derived = await geonamesLookup(unknown);
  const coordinateUpdates = await applyDerivedLocations(derived);
  return {
    removedLegacyNearPrefixes,
    repairedUsfsLongitudeSigns,
    deactivatedMissingCoordinates,
    linkedSourceUpdates,
    coordinateCandidates: unknown.length,
    coordinateUpdates,
    dataset: "GeoNames cities500 (CC BY 4.0)",
  };
}
