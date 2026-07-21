import { sqlClient } from "@/db";

const majorOnly = process.argv.includes("--major-only");
const minorOnly = process.argv.includes("--minor-only");
if (majorOnly && minorOnly)
  throw new Error("Choose either --major-only or --minor-only");
const versionArgumentIndex = process.argv.indexOf("--version");
const version =
  versionArgumentIndex >= 0 && process.argv[versionArgumentIndex + 1]
    ? process.argv[versionArgumentIndex + 1]
    : "habitat-north-america-v1";

type CoverageRow = {
  country: string;
  region: string;
  total: number;
  measured: number;
  current_version: number;
  provisional: number;
};

try {
  const unsupported = await sqlClient<
    Array<{
      slug: string;
      name: string;
      latitude: number;
      longitude: number;
    }>
  >`
    SELECT slug, name, latitude, longitude
    FROM campgrounds
    WHERE active = true AND country IN ('CA', 'US')
      AND NOT (
        latitude BETWEEN 14 AND 84
        AND longitude BETWEEN -180 AND -52
      )
    ORDER BY slug
  `;
  const rows = await sqlClient<CoverageRow[]>`
    SELECT c.country, c.region, count(*)::int AS total,
      count(*) FILTER (WHERE pv.data_kind = 'measured-geospatial')::int AS measured,
      count(*) FILTER (
        WHERE pv.version = ${version} AND hp.active = true
      )::int AS current_version,
      count(*) FILTER (
        WHERE pv.data_kind = 'representative-prototype' AND hp.active = true
      )::int AS provisional
    FROM campgrounds c
    LEFT JOIN LATERAL (
      SELECT campsite_count
      FROM location_source_records
      WHERE campground_id = c.id AND campsite_count IS NOT NULL
      ORDER BY
        CASE campsite_count_kind
          WHEN 'official_total' THEN 3
          WHEN 'reservable_inventory' THEN 2
          ELSE 1
        END DESC,
        authoritative DESC, source_priority DESC,
        campsite_count_checked_at DESC NULLS LAST
      LIMIT 1
    ) capacity ON true
    LEFT JOIN campground_habitat_profiles hp
      ON hp.campground_id = c.id AND hp.active = true
    LEFT JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
    WHERE c.active = true AND c.country IN ('CA', 'US')
      AND c.latitude BETWEEN 14 AND 84
      AND c.longitude BETWEEN -180 AND -52
      AND (${majorOnly} = false OR coalesce(capacity.campsite_count, 0) >= 50)
      AND (${minorOnly} = false OR (
        coalesce(capacity.campsite_count, 0) < 50
        AND c.verification_status <> 'unverified'
        AND c.operational_status <> 'closed'
      ))
    GROUP BY c.country, c.region
    ORDER BY c.country, c.region
  `;
  const summary = rows.reduce(
    (result, row) => ({
      total: result.total + Number(row.total),
      measured: result.measured + Number(row.measured),
      currentVersion: result.currentVersion + Number(row.current_version),
      provisional: result.provisional + Number(row.provisional),
    }),
    { total: 0, measured: 0, currentVersion: 0, provisional: 0 },
  );
  console.log(
    JSON.stringify(
      {
        version,
        selection: majorOnly
          ? "major-campgrounds-50-plus-sites"
          : minorOnly
            ? "verified-minor-campgrounds-under-50-sites"
            : "all",
        summary: {
          ...summary,
          excludedInvalidCoordinates: unsupported.length,
        },
        regions: rows,
        excludedLocations: unsupported,
      },
      null,
      2,
    ),
  );
  if (
    process.argv.includes("--require-complete") &&
    summary.currentVersion !== summary.total
  ) {
    process.exitCode = 1;
  }
} finally {
  await sqlClient.end();
}
