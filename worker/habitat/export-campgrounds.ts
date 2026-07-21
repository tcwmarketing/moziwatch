import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sqlClient } from "@/db";

const majorOnly = process.argv.includes("--major-only");
const minorOnly = process.argv.includes("--minor-only");
if (majorOnly && minorOnly)
  throw new Error("Choose either --major-only or --minor-only, not both");
const pathArgument = process.argv
  .slice(2)
  .find((argument) => !argument.startsWith("--"));
const outputPath = resolve(
  pathArgument || "data/habitat/north-america-campgrounds.json",
);

try {
  const rows = await sqlClient<
    Array<{
      id: string;
      slug: string;
      name: string;
      latitude: number;
      longitude: number;
      country: string;
      region: string;
      location_type: string;
      source_geometry: Record<string, unknown> | null;
      forecast_cadence: string;
      has_measured_profile: boolean;
      profile_versions: string[];
    }>
  >`
    SELECT c.id, c.slug, c.name, c.latitude, c.longitude, c.country, c.region,
      c.location_type, c.source_geometry,
      coalesce(s.cadence::text, 'weekly') AS forecast_cadence,
      EXISTS (
        SELECT 1 FROM campground_habitat_profiles hp
        JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
        WHERE hp.campground_id = c.id AND hp.active = true
          AND pv.data_kind = 'measured-geospatial'
      ) AS has_measured_profile
      , ARRAY(
        SELECT pv.version
        FROM campground_habitat_profiles hp
        JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
        WHERE hp.campground_id = c.id
      ) AS profile_versions
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
    LEFT JOIN campground_forecast_schedules s ON s.campground_id = c.id
    WHERE c.active = true
      AND c.country IN ('CA', 'US')
      AND c.latitude BETWEEN 14 AND 84
      AND c.longitude BETWEEN -180 AND -52
      AND (${majorOnly} = false OR coalesce(capacity.campsite_count, 0) >= 50)
      AND (${minorOnly} = false OR (
        coalesce(capacity.campsite_count, 0) < 50
        AND c.verification_status <> 'unverified'
        AND c.operational_status <> 'closed'
      ))
    ORDER BY
      CASE s.cadence WHEN 'daily' THEN 0 WHEN 'weekly' THEN 1 ELSE 2 END,
      c.country, c.region, c.slug
  `;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        count: rows.length,
        selection: majorOnly
          ? "major-campgrounds-50-plus-sites"
          : minorOnly
            ? "verified-minor-campgrounds-under-50-sites"
            : "all-active-campgrounds",
        campgrounds: rows.map((row) => ({
          id: row.id,
          slug: row.slug,
          name: row.name,
          latitude: Number(row.latitude),
          longitude: Number(row.longitude),
          country: row.country,
          region: row.region,
          locationType: row.location_type,
          sourceGeometry: row.source_geometry,
          forecastCadence: row.forecast_cadence,
          hasMeasuredProfile: row.has_measured_profile,
          profileVersions: row.profile_versions,
        })),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  console.log(`Exported ${rows.length} campgrounds to ${outputPath}`);
} finally {
  await sqlClient.end();
}
