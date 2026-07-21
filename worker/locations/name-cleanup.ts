import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";
import { cleanDisplayName, normalizeName } from "./types";
import { obviousNonCampgroundFeature } from "./classification";

type CampgroundNameRow = {
  id: string;
  name: string;
  slug: string;
  active: boolean;
  location_type: string;
  city: string;
  region: string;
  country: string;
  latitude: number;
  longitude: number;
  data_source: string;
  verification_status: string;
  sources: string[];
  report_count: number;
  saved_count: number;
};

type SourceNameRow = { id: string; name: string | null };
const apply = process.argv.includes("--apply");
const verbose = process.argv.includes("--verbose");

try {
  const rows = await sqlClient<CampgroundNameRow[]>`
    SELECT c.id, c.name, c.slug, c.active, c.location_type, c.city, c.region,
      c.country, c.latitude, c.longitude, c.data_source,
      c.verification_status,
      coalesce(array_agg(DISTINCT source.source) FILTER (
        WHERE source.source IS NOT NULL
      ), ARRAY[]::text[]) AS sources,
      (SELECT count(*)::int FROM reports report
        WHERE report.campground_id = c.id AND report.deleted_at IS NULL
      ) AS report_count,
      (SELECT count(*)::int FROM saved_campgrounds saved
        WHERE saved.campground_id = c.id
      ) AS saved_count
    FROM campgrounds c
    LEFT JOIN location_source_records source ON source.campground_id = c.id
    GROUP BY c.id
    ORDER BY c.name, c.id
  `;
  const changes = rows.flatMap((row) => {
    const cleaned = cleanDisplayName(row.name);
    return cleaned && cleaned !== row.name ? [{ ...row, cleaned }] : [];
  });
  const nonCampgroundCandidates = rows.filter(
    (row) =>
      row.active &&
      obviousNonCampgroundFeature(cleanDisplayName(row.name)) &&
      Number(row.report_count) === 0 &&
      Number(row.saved_count) === 0,
  );

  const sourceRows = await sqlClient<SourceNameRow[]>`
    SELECT id, normalized_payload->>'name' AS name
    FROM location_source_records
    WHERE normalized_payload ? 'name'
  `;
  const sourceChanges = sourceRows.flatMap((row) => {
    const cleaned = cleanDisplayName(row.name || "");
    return cleaned && cleaned !== row.name
      ? [{ id: row.id, name: cleaned, normalizedName: normalizeName(cleaned) }]
      : [];
  });

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        canonicalChanges: changes.length,
        sourceRecordChanges: sourceChanges.length,
        nonCampgroundsToDeactivate: nonCampgroundCandidates.length,
        ...(apply && !verbose
          ? {}
          : {
              nonCampgrounds: nonCampgroundCandidates.map((row) => ({
                name: row.name,
                cleaned: cleanDisplayName(row.name),
                slug: row.slug,
                source: row.data_source,
                location: `${row.city}, ${row.region}, ${row.country}`,
              })),
            }),
        ...(verbose ? { campgrounds: changes } : {}),
      },
      null,
      2,
    ),
  );

  if (apply && (changes.length || sourceChanges.length)) {
    await sqlClient.begin(async (tx) => {
      if (changes.length) {
        const updates = changes.map(({ id, cleaned }) => ({
          id,
          name: cleaned,
          normalizedName: normalizeName(cleaned),
        }));
        await tx`
          WITH input AS (
            SELECT * FROM jsonb_to_recordset(${toPostgresJson(updates)}::jsonb)
              AS x(id uuid, name text, "normalizedName" text)
          )
          UPDATE campgrounds campground SET
            name = input.name,
            normalized_name = input."normalizedName",
            updated_at = now()
          FROM input
          WHERE campground.id = input.id
        `;
      }
      if (sourceChanges.length) {
        await tx`
          WITH input AS (
            SELECT * FROM jsonb_to_recordset(${toPostgresJson(sourceChanges)}::jsonb)
              AS x(id uuid, name text, "normalizedName" text)
          )
          UPDATE location_source_records source SET
            normalized_payload = jsonb_set(
              jsonb_set(source.normalized_payload, '{name}', to_jsonb(input.name)),
              '{normalizedName}', to_jsonb(input."normalizedName")
            ),
            updated_at = now()
          FROM input
          WHERE source.id = input.id
        `;
      }
      if (nonCampgroundCandidates.length) {
        const ids = nonCampgroundCandidates.map((row) => row.id);
        await tx`
          INSERT INTO location_source_tombstones (
            source, external_id, reason_code, rule_version, name,
            normalized_name, country, region, latitude, longitude,
            source_confidence, primary_category, source_release,
            source_checksum, first_rejected_at, last_rejected_at
          )
          SELECT source.source, source.external_id,
            'non_campground_recreation_feature', 'location-name-policy-v1',
            campground.name, campground.normalized_name, campground.country,
            campground.region, campground.latitude, campground.longitude,
            NULL, NULL, source.source_release, source.checksum, now(), now()
          FROM location_source_records source
          JOIN campgrounds campground ON campground.id = source.campground_id
          WHERE campground.id = ANY(${ids}::uuid[])
          ON CONFLICT (source, external_id) DO UPDATE SET
            reason_code = excluded.reason_code,
            rule_version = excluded.rule_version,
            name = excluded.name,
            normalized_name = excluded.normalized_name,
            country = excluded.country,
            region = excluded.region,
            latitude = excluded.latitude,
            longitude = excluded.longitude,
            source_release = excluded.source_release,
            source_checksum = excluded.source_checksum,
            last_rejected_at = now()
        `;
        await tx`
          UPDATE campgrounds SET active = false,
            operational_status = 'closed', updated_at = now()
          WHERE id = ANY(${ids}::uuid[])
        `;
      }
    });
    console.log(
      JSON.stringify({
        applied: true,
        canonical: changes.length,
        sourceRecords: sourceChanges.length,
        nonCampgroundsDeactivated: nonCampgroundCandidates.length,
      }),
    );
  }
} finally {
  await sqlClient.end();
}
