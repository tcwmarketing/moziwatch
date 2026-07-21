import { afterAll, describe, expect, it } from "vitest";
import { assertDisposableTestDatabase } from "@/lib/test-database";
import type {
  ImportOptions,
  NormalizedLocation,
} from "@/worker/locations/types";

const enabled = Boolean(process.env.TEST_DATABASE_URL);
const nonce = `location-test-${Date.now()}`;

function record(
  externalId: string,
  name: string,
  longitude: number,
  latitude: number,
  source: NormalizedLocation["source"] = "openstreetmap",
): NormalizedLocation {
  return {
    source,
    externalId: `${nonce}-${externalId}`,
    sourceUrl: `https://example.test/${externalId}`,
    license: "fixture-only",
    attribution: "Fixture test data",
    priority:
      source.startsWith("overture") || source === "openstreetmap" ? 60 : 90,
    name: `${name} ${nonce}`,
    normalizedName: `${name} ${nonce}`
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim(),
    locationType: "developed_campground",
    country: source === "nps" ? "US" : "CA",
    region: source === "nps" ? "WA" : source === "parks-canada" ? "AB" : "BC",
    locality: "Fixtureville",
    address: `${externalId} Test Road`,
    geometry: { type: "Point", coordinates: [longitude, latitude] },
    operator: null,
    website: null,
    phone: null,
    reservationUrl: null,
    description: "Integration fixture",
    parentName: null,
    raw: { externalId, name },
  };
}

async function* records(...values: NormalizedLocation[]) {
  for (const value of values) yield value;
}

const options: ImportOptions = {
  dryRun: false,
  batchSize: 1,
  datasetVersion: nonce,
};

describe.skipIf(!enabled)(
  "location ingestion on disposable PostGIS database",
  () => {
    process.env.DATABASE_URL = enabled
      ? assertDisposableTestDatabase()
      : undefined;

    afterAll(async () => {
      if (!enabled) return;
      const { sqlClient } = await import("@/db");
      await sqlClient.begin(async (tx) => {
        const ids = await tx<{ id: string }[]>`
        SELECT id FROM campgrounds WHERE name ILIKE ${`%${nonce}%`}
      `;
        const campgroundIds = ids.map((row) => row.id);
        if (campgroundIds.length) {
          await tx`DELETE FROM reports WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
          await tx`DELETE FROM saved_campgrounds WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
          await tx`DELETE FROM campground_aggregates WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
          await tx`DELETE FROM location_aliases WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
          await tx`DELETE FROM location_suggestions WHERE campground_id = ANY(${campgroundIds}::uuid[])`;
        }
        await tx`DELETE FROM location_source_records WHERE external_id LIKE ${`${nonce}-%`}`;
        if (campgroundIds.length)
          await tx`DELETE FROM campgrounds WHERE id = ANY(${campgroundIds}::uuid[])`;
        await tx`DELETE FROM location_import_runs WHERE dataset_version = ${nonce}`;
        await tx`DELETE FROM admin_audit_logs WHERE actor_id = ${nonce}`;
        await tx`DELETE FROM "user" WHERE id = ${nonce}`;
      });
      await sqlClient.end();
    });

    it("is idempotent, preserves manual locks, and does not delete after one miss", async () => {
      const { sqlClient } = await import("@/db");
      const { processLocationImport } =
        await import("@/worker/locations/importer");
      const original = record("idempotent", "Pine Creek", -123.1, 49.2);
      original.raw = {
        capacity: "50",
        email: "camp@example.test",
        photo: "https://images.example.test/pine.jpg",
        unusedDescription: "This should not be retained",
      };
      await processLocationImport("openstreetmap", records(original), options);
      const second = await processLocationImport(
        "openstreetmap",
        records(original),
        options,
      );
      expect(second.counts.unchanged).toBe(1);
      const source = await sqlClient<
        Array<{
          campground_id: string;
          raw_payload: Record<string, unknown>;
          contact_emails: string[];
          related_urls: string[];
          source_geometry: Record<string, unknown> | null;
        }>
      >`
      SELECT campground_id, raw_payload, contact_emails, related_urls,
        source_geometry
      FROM location_source_records
      WHERE source = 'openstreetmap' AND external_id = ${original.externalId}
    `;
      expect(source).toHaveLength(1);
      expect(source[0].raw_payload).toEqual({ capacity: "50" });
      expect(source[0].contact_emails).toEqual(["camp@example.test"]);
      expect(source[0].related_urls).toContain(
        "https://images.example.test/pine.jpg",
      );
      expect(source[0].source_geometry).toBeNull();
      await sqlClient`
      UPDATE campgrounds SET name = ${`Manually verified ${nonce}`},
        normalized_name = ${`manually verified ${nonce}`},
        manual_locks = ARRAY['name'], verification_status = 'manually_verified'
      WHERE id = ${source[0].campground_id}::uuid
    `;
      const changed = {
        ...original,
        name: `Lower priority replacement ${nonce}`,
        normalizedName: `lower priority replacement ${nonce}`,
        raw: { changed: true },
      };
      await processLocationImport("openstreetmap", records(changed), options);
      const canonical = await sqlClient<
        Array<{ name: string; active: boolean }>
      >`SELECT name, active FROM campgrounds WHERE id = ${source[0].campground_id}::uuid`;
      expect(canonical[0].name).toBe(`Manually verified ${nonce}`);

      await processLocationImport("openstreetmap", records(), options);
      const missing = await sqlClient<{ consecutive_missing_count: number }[]>`
      SELECT consecutive_missing_count FROM location_source_records
      WHERE source = 'openstreetmap' AND external_id = ${original.externalId}
    `;
      expect(missing[0].consecutive_missing_count).toBe(1);
      expect(canonical[0].active).toBe(true);

      await processLocationImport("openstreetmap", records(), options);
      const flagged = await sqlClient<
        { operational_status: string; active: boolean }[]
      >`
        SELECT operational_status, active FROM campgrounds
        WHERE id = ${source[0].campground_id}::uuid
      `;
      expect(flagged[0]).toEqual({
        operational_status: "review",
        active: true,
      });
    });

    it("spatially matches cross-source duplicates while preserving adjacent locations", async () => {
      const { sqlClient } = await import("@/db");
      const { processLocationImport } =
        await import("@/worker/locations/importer");
      const osm = record("cross-osm", "Silver Lake", -121.5, 47.5);
      osm.country = "US";
      osm.region = "WA";
      const nps = record("cross-nps", "Silver Lake", -121.5001, 47.5001, "nps");
      await processLocationImport("openstreetmap", records(osm), options);
      const npsRun = await processLocationImport("nps", records(nps), options);
      expect(npsRun.counts.matched).toBe(1);
      const links = await sqlClient<{ campground_id: string }[]>`
      SELECT campground_id FROM location_source_records
      WHERE external_id IN (${osm.externalId}, ${nps.externalId})
    `;
      expect(new Set(links.map((item) => item.campground_id)).size).toBe(1);

      const north = record("adjacent-north", "North Basin", -120, 48);
      const south = record("adjacent-south", "South Basin", -120.0001, 48.0001);
      await processLocationImport(
        "openstreetmap",
        records(north, south),
        options,
      );
      const adjacent = await sqlClient<{ campground_id: string }[]>`
      SELECT campground_id FROM location_source_records
      WHERE external_id IN (${north.externalId}, ${south.externalId})
    `;
      expect(new Set(adjacent.map((item) => item.campground_id)).size).toBe(2);

      const reviewOsm = record("review-osm", "Review Lake", -118, 46);
      reviewOsm.country = "US";
      reviewOsm.region = "WA";
      const reviewNps = record(
        "review-nps",
        "Review Lake",
        -118,
        46.009,
        "nps",
      );
      await processLocationImport("openstreetmap", records(reviewOsm), options);
      const firstReview = await processLocationImport(
        "nps",
        records(reviewNps),
        options,
      );
      const repeatedReview = await processLocationImport(
        "nps",
        records(reviewNps),
        options,
      );
      expect(firstReview.counts.mergeCandidates).toBe(1);
      expect(repeatedReview.counts.mergeCandidates).toBe(0);
      const candidateCount = await sqlClient<{ count: number }[]>`
      SELECT count(*)::int AS count FROM location_merge_candidates m
      JOIN location_source_records s ON s.id = m.source_record_id
      WHERE s.external_id = ${reviewNps.externalId}
    `;
      expect(candidateCount[0].count).toBe(1);
    });

    it("keeps the Overture canonical ID when an official source later matches it", async () => {
      const { sqlClient } = await import("@/db");
      const { processLocationImport } =
        await import("@/worker/locations/importer");
      const overture = record(
        "official-overture",
        "Prairie Sky",
        -115.2,
        51.1,
        "overture-ca",
      );
      overture.region = "AB";
      const official = record(
        "official-parks",
        "Prairie Sky",
        -115.20005,
        51.10005,
        "parks-canada",
      );
      await processLocationImport("overture-ca", records(overture), options);
      const before = await sqlClient<{ campground_id: string }[]>`
        SELECT campground_id FROM location_source_records
        WHERE source = 'overture-ca' AND external_id = ${overture.externalId}
      `;
      const result = await processLocationImport(
        "parks-canada",
        records(official),
        options,
      );
      const links = await sqlClient<
        { source: string; campground_id: string }[]
      >`
        SELECT source, campground_id FROM location_source_records
        WHERE external_id IN (${overture.externalId}, ${official.externalId})
      `;
      expect(result.counts.matched).toBe(1);
      expect(links).toHaveLength(2);
      expect(new Set(links.map((row) => row.campground_id))).toEqual(
        new Set([before[0].campground_id]),
      );
      const canonical = await sqlClient<{ verification_status: string }[]>`
        SELECT verification_status FROM campgrounds
        WHERE id = ${before[0].campground_id}::uuid
      `;
      expect(canonical[0].verification_status).toBe("source_verified");
    });

    it("bootstraps Overture records with set-based idempotent upserts", async () => {
      const { sqlClient } = await import("@/db");
      const { processInitialOvertureImport } =
        await import("@/worker/locations/overture-bootstrap");
      const first = record(
        "bulk-first",
        "Bulk Pine",
        -109.1,
        44.1,
        "overture-us",
      );
      first.country = "US";
      first.region = "WY";
      const second = record(
        "bulk-second",
        "Bulk Cedar",
        -109.2,
        44.2,
        "overture-us",
      );
      second.country = "US";
      second.region = "WY";
      const result = await processInitialOvertureImport(
        "overture-us",
        records(first, second),
        nonce,
        2,
      );
      expect(result.counts.inserted).toBe(2);
      const links = await sqlClient<{ campground_id: string | null }[]>`
        SELECT campground_id FROM location_source_records
        WHERE external_id IN (${first.externalId}, ${second.externalId})
      `;
      expect(links).toHaveLength(2);
      expect(links.every((row) => row.campground_id)).toBe(true);
    });

    it("resumes a failed import from its checkpoint without duplicate source records", async () => {
      const { sqlClient } = await import("@/db");
      const { processLocationImport } =
        await import("@/worker/locations/importer");
      const first = record("resume-first", "Resume First", -100, 50);
      const second = record("resume-second", "Resume Second", -102, 52);
      async function* failed() {
        yield first;
        throw new Error("fixture interruption");
      }
      let failedRun = "";
      try {
        await processLocationImport("openstreetmap", failed(), options);
      } catch {
        const rows = await sqlClient<{ id: string }[]>`
        SELECT id FROM location_import_runs
        WHERE dataset_version = ${nonce} AND status = 'failed'
        ORDER BY started_at DESC LIMIT 1
      `;
        failedRun = rows[0].id;
      }
      expect(failedRun).toBeTruthy();
      const resumed = await processLocationImport(
        "openstreetmap",
        records(first, second),
        { ...options, resumeRunId: failedRun },
      );
      expect(resumed.counts.downloaded).toBe(2);
      const count = await sqlClient<{ count: number }[]>`
      SELECT count(*)::int AS count FROM location_source_records
      WHERE external_id IN (${first.externalId}, ${second.externalId})
    `;
      expect(count[0].count).toBe(2);
    });

    it("transactionally merges reports and preserves the old slug alias", async () => {
      const { sqlClient } = await import("@/db");
      const { mergeCanonicalLocations } = await import("@/lib/location-merge");
      await sqlClient`
      INSERT INTO "user" (id, name, email, role)
      VALUES (${nonce}, 'Location Test Admin', ${`${nonce}@example.test`}, 'admin')
    `;
      const locations = await sqlClient<{ id: string; slug: string }[]>`
      INSERT INTO campgrounds (
        name, normalized_name, slug, address, city, region, country,
        postal_code, latitude, longitude
      ) VALUES
        (${`Merge Survivor ${nonce}`}, ${`merge survivor ${nonce}`}, ${`${nonce}-survivor`},
          '1 Test', 'Test', 'BC', 'CA', '', 55, -125),
        (${`Merge Duplicate ${nonce}`}, ${`merge duplicate ${nonce}`}, ${`${nonce}-old-slug`},
          '2 Test', 'Test', 'BC', 'CA', '', 55.0001, -125.0001)
      RETURNING id, slug
    `;
      const survivor = locations.find((item) =>
        item.slug.endsWith("survivor"),
      )!;
      const duplicate = locations.find((item) =>
        item.slug.endsWith("old-slug"),
      )!;
      const report = await sqlClient<{ id: string }[]>`
      INSERT INTO reports (campground_id, rating, ip_hash)
      VALUES (${duplicate.id}::uuid, 4, ${`${nonce}-merge-ip`}) RETURNING id
    `;
      await mergeCanonicalLocations(survivor.id, duplicate.id, nonce);
      const moved = await sqlClient<{ campground_id: string }[]>`
      SELECT campground_id FROM reports WHERE id = ${report[0].id}::uuid
    `;
      const alias = await sqlClient<{ campground_id: string }[]>`
      SELECT campground_id FROM location_aliases WHERE slug = ${duplicate.slug}
    `;
      expect(moved[0].campground_id).toBe(survivor.id);
      expect(alias[0].campground_id).toBe(survivor.id);
    });

    it("scans existing canonical campgrounds and persists duplicate candidates", async () => {
      const { sqlClient } = await import("@/db");
      const rows = await sqlClient<{ id: string }[]>`
        INSERT INTO campgrounds (
          name, normalized_name, slug, address, city, region, country,
          postal_code, latitude, longitude, website
        ) VALUES
          (${`Cedar Ridge Camp ${nonce}`}, ${`cedar ridge camp ${nonce}`},
            ${`${nonce}-duplicate-scan-a`}, '8 Cedar Road', 'Fixtureville',
            ${nonce}, 'CA', '', 50, -120,
            ${`https://example.test/campgrounds/${nonce}`}),
          (${`Cedar Ridge Family Campground ${nonce}`},
            ${`cedar ridge family campground ${nonce}`},
            ${`${nonce}-duplicate-scan-b`}, '8 Cedar Rd.', 'Fixtureville',
            ${nonce}, 'CA', '', 50.0001, -120.0001,
            ${`https://example.test/campgrounds/${nonce}`})
        RETURNING id
      `;
      const { scanCanonicalDuplicates } =
        await import("@/worker/locations/duplicate-audit");
      const result = await scanCanonicalDuplicates({
        country: "CA",
        region: nonce,
        persist: true,
      });
      expect(result).toMatchObject({ scanned: 2, detected: 1, persisted: 1 });
      const candidates = await sqlClient<
        Array<{
          left_campground_id: string;
          right_campground_id: string;
          status: string;
        }>
      >`
        SELECT left_campground_id, right_campground_id, status
        FROM canonical_duplicate_candidates
        WHERE left_campground_id = ANY(${rows.map((row) => row.id)}::uuid[])
          OR right_campground_id = ANY(${rows.map((row) => row.id)}::uuid[])
      `;
      expect(candidates).toHaveLength(1);
      expect(candidates[0].status).toBe("pending");
    });

    it("returns only canonical records from the public bounding-box query", async () => {
      const { sqlClient } = await import("@/db");
      const { listCampgrounds } = await import("@/lib/campgrounds");
      const run = await sqlClient<{ id: string }[]>`
      INSERT INTO location_import_runs (source, dataset_version, status)
      VALUES ('fixture-unmatched', ${nonce}, 'completed') RETURNING id
    `;
      await sqlClient`
        INSERT INTO location_source_providers (
          source, license, attribution, default_priority
        ) VALUES ('fixture-unmatched', 'fixture', 'fixture', 50)
        ON CONFLICT (source) DO NOTHING
      `;
      await sqlClient`
      INSERT INTO location_source_records (
        source, external_id, fetched_at, last_seen_at,
        checksum, raw_payload, normalized_payload, representative_point, import_run_id
      ) VALUES (
        'fixture-unmatched', ${`${nonce}-unmatched`}, now(), now(),
        repeat('a', 64), '{}'::jsonb, ${JSON.stringify({ name: "Source only" })}::jsonb,
        extensions.st_setsrid(extensions.st_makepoint(0, 0), 4326), ${run[0].id}::uuid
      )
    `;
      const features = await listCampgrounds("recent", {
        west: -0.1,
        south: -0.1,
        east: 0.1,
        north: 0.1,
      });
      expect(features).toHaveLength(0);
    });

    it("returns compact server groups before detailed local map markers", async () => {
      const { sqlClient } = await import("@/db");
      const { getCampgroundMapDetail, listCampgrounds } =
        await import("@/lib/campgrounds");
      const rows = await sqlClient<{ id: string }[]>`
        INSERT INTO campgrounds (
          name, normalized_name, slug, address, city, region, country,
          postal_code, latitude, longitude, verification_status
        ) VALUES
          (${`Map Alpha ${nonce}`}, ${`map alpha ${nonce}`}, ${`${nonce}-map-alpha`},
            '1 Map Test', 'Fixtureville', 'BC', 'CA', '', 52.0000, -120.0000,
            'source_verified'),
          (${`Map Beta ${nonce}`}, ${`map beta ${nonce}`}, ${`${nonce}-map-beta`},
            '2 Map Test', 'Fixtureville', 'BC', 'CA', '', 52.0005, -120.0005,
            'source_verified'),
          (${`Map Gamma ${nonce}`}, ${`map gamma ${nonce}`}, ${`${nonce}-map-gamma`},
            '3 Map Test', 'Fixtureville', 'BC', 'CA', '', 52.0010, -120.0010,
            'source_verified'),
          (${`Map Delta ${nonce}`}, ${`map delta ${nonce}`}, ${`${nonce}-map-delta`},
            '4 Map Test', 'Fixtureville', 'BC', 'CA', '', 52.0015, -120.0015,
            'source_verified'),
          (${`Map Epsilon ${nonce}`}, ${`map epsilon ${nonce}`}, ${`${nonce}-map-epsilon`},
            '5 Map Test', 'Fixtureville', 'BC', 'CA', '', 52.0020, -120.0020,
            'unverified')
        RETURNING id
      `;
      const capacityRun = await sqlClient<{ id: string }[]>`
        INSERT INTO location_import_runs (source, dataset_version, status)
      VALUES ('fixture-capacity', ${nonce}, 'completed') RETURNING id
      `;
      await sqlClient`
        INSERT INTO location_source_providers (
          source, license, attribution, default_priority
        ) VALUES ('fixture-capacity', 'fixture', 'Fixture capacity', 90)
        ON CONFLICT (source) DO NOTHING
      `;
      await sqlClient`
        INSERT INTO location_source_records (
          source, external_id, campground_id,
          fetched_at, last_seen_at, checksum, raw_payload, normalized_payload,
          representative_point, source_priority, campsite_count,
          campsite_count_kind, campsite_count_checked_at, import_run_id
        ) VALUES (
          'fixture-capacity', ${`${nonce}-capacity`}, ${rows[0].id}::uuid,
          now(), now(), repeat('c', 64),
          '{}'::jsonb, '{}'::jsonb,
          extensions.st_setsrid(extensions.st_makepoint(-120, 52), 4326),
          90, 80, 'official_total', now(), ${capacityRun[0].id}::uuid
        )
      `;
      const bounds = {
        west: -120.01,
        south: 51.99,
        east: -119.99,
        north: 52.01,
      };

      const groups = await listCampgrounds("recent", bounds, undefined, 3);
      expect(groups).toHaveLength(1);
      expect(groups[0].properties).toMatchObject({
        server_cluster: true,
        point_count: 4,
      });
      const allGroups = await listCampgrounds(
        "recent",
        bounds,
        undefined,
        3,
        "all",
      );
      expect(allGroups[0].properties).toMatchObject({
        server_cluster: true,
        point_count: 5,
      });

      const markers = await listCampgrounds("recent", bounds, undefined, 10);
      expect(markers).toHaveLength(4);
      const allMarkers = await listCampgrounds(
        "recent",
        bounds,
        undefined,
        10,
        "all",
      );
      expect(allMarkers).toHaveLength(5);
      expect(markers[0].properties).not.toHaveProperty("description");
      expect(markers[0].properties).not.toHaveProperty(
        "official_campsite_count",
      );

      const detail = await getCampgroundMapDetail(rows[0].id, "recent");
      expect(detail).toMatchObject({
        id: rows[0].id,
        city: "Fixtureville",
        official_campsite_count: 80,
        campsite_count_kind: "official_total",
        campsite_count_source: "fixture-capacity",
      });
    });
  },
);
