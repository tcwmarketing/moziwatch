import { readFile } from "node:fs/promises";
import type { CampgroundHabitatProfile } from "@/config/forecast";
import { sqlClient } from "@/db";
import { toPostgresJson } from "@/lib/postgres-json";

type HabitatInput = {
  version: string;
  dataKind: "measured-geospatial";
  sourceManifest: Record<string, unknown>;
  methodNotes: string;
  profiles: Array<{
    campgroundSlug: string;
    profile: CampgroundHabitatProfile;
    sourceProvenance: Record<string, unknown>;
  }>;
};

function finite(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value))
    throw new Error(`Invalid habitat value: ${label}`);
  return value;
}

const inputPath = process.argv[2] || process.env.HABITAT_INPUT_PATH;
if (!inputPath)
  throw new Error(
    "Pass an offline-produced habitat JSON file or set HABITAT_INPUT_PATH",
  );
const input = JSON.parse(await readFile(inputPath, "utf8")) as HabitatInput;
if (!input.version || input.dataKind !== "measured-geospatial")
  throw new Error(
    "Habitat input requires a version and measured-geospatial dataKind",
  );
if (!Array.isArray(input.profiles) || !input.profiles.length)
  throw new Error("Habitat input contains no profiles");

try {
  const versions = await sqlClient<{ id: string }[]>`
    INSERT INTO habitat_profile_versions (
      version, data_kind, source_manifest, method_notes
    ) VALUES (
      ${input.version}, ${input.dataKind},
      ${toPostgresJson(input.sourceManifest)}::jsonb, ${input.methodNotes}
    )
    ON CONFLICT (version) DO UPDATE SET
      source_manifest = excluded.source_manifest,
      method_notes = excluded.method_notes
    RETURNING id
  `;
  const versionId = versions[0].id;
  let processed = 0;
  for (let offset = 0; offset < input.profiles.length; offset += 20) {
    await Promise.all(
      input.profiles.slice(offset, offset + 20).map(async (item) => {
        const p = item.profile;
        const coverageGaps = Array.isArray(item.sourceProvenance.coverageGaps)
          ? item.sourceProvenance.coverageGaps.map((gap) =>
              input.version === "habitat-minor-fast-v1"
                ? String(gap).replace(
                    "fast major-campground profile",
                    "simplified minor-campground profile",
                  )
                : gap,
            )
          : item.sourceProvenance.coverageGaps;
        const sourceProvenance = {
          ...item.sourceProvenance,
          processingMode:
            input.version === "habitat-minor-fast-v1"
              ? "minor-simplified-30m-3km"
              : item.sourceProvenance.processingMode,
          coverageGaps,
        };
        finite(p.profileConfidence, `${item.campgroundSlug}.profileConfidence`);
        finite(
          p.wetlandCoverage.within250m,
          `${item.campgroundSlug}.wetlands250m`,
        );
        if (!p.dataCoverage?.sources?.length)
          throw new Error(
            `${item.campgroundSlug} is missing source coverage metadata`,
          );
        await sqlClient.begin(async (tx) => {
          const campground = await tx<{ id: string }[]>`
        SELECT id FROM campgrounds
        WHERE slug = ${item.campgroundSlug} AND active = true LIMIT 1
      `;
          if (!campground[0])
            throw new Error(`Campground not found: ${item.campgroundSlug}`);
          await tx`
        UPDATE campground_habitat_profiles SET active = false
        WHERE campground_id = ${campground[0].id}::uuid AND active = true
      `;
          await tx`
        INSERT INTO campground_habitat_profiles (
          campground_id, profile_version_id, wetland_coverage, marsh_coverage,
          seasonal_water_coverage, forest_coverage, small_water_body_density,
          stagnant_water_potential, lake_shoreline_proximity,
          shoreline_water_edge_length_km, large_open_water_coverage,
          fast_river_proximity, slow_river_proximity, vegetation_coverage,
          elevation_m, slope_degrees, drainage_potential, floodplain_exposure,
          annual_rainfall_mm, warm_season_rainfall_mm, land_cover_type,
          profile_confidence, source_provenance, data_coverage, active
        ) VALUES (
          ${campground[0].id}::uuid, ${versionId}::uuid,
          ${toPostgresJson(p.wetlandCoverage)}::jsonb,
          ${toPostgresJson(p.marshCoverage)}::jsonb,
          ${toPostgresJson(p.seasonalWaterCoverage)}::jsonb,
          ${toPostgresJson(p.forestCoverage)}::jsonb,
          ${p.smallWaterBodyDensity}, ${p.stagnantWaterPotential},
          ${p.lakeShorelineProximity}, ${p.shorelineWaterEdgeLengthKm ?? 0},
          ${p.largeOpenWaterCoverage}, ${p.fastRiverProximity},
          ${p.slowRiverProximity}, ${p.vegetationCoverage}, ${p.elevationM},
          ${p.slopeDegrees}, ${p.drainagePotential}, ${p.floodplainExposure ?? 0},
          ${p.annualRainfallMm}, ${p.warmSeasonRainfallMm}, ${p.landCoverType},
          ${p.profileConfidence}, ${toPostgresJson(sourceProvenance)}::jsonb,
          ${toPostgresJson(p.dataCoverage)}::jsonb, true
        )
        ON CONFLICT (campground_id, profile_version_id) DO UPDATE SET
          wetland_coverage = excluded.wetland_coverage,
          marsh_coverage = excluded.marsh_coverage,
          seasonal_water_coverage = excluded.seasonal_water_coverage,
          forest_coverage = excluded.forest_coverage,
          small_water_body_density = excluded.small_water_body_density,
          stagnant_water_potential = excluded.stagnant_water_potential,
          lake_shoreline_proximity = excluded.lake_shoreline_proximity,
          shoreline_water_edge_length_km = excluded.shoreline_water_edge_length_km,
          large_open_water_coverage = excluded.large_open_water_coverage,
          fast_river_proximity = excluded.fast_river_proximity,
          slow_river_proximity = excluded.slow_river_proximity,
          vegetation_coverage = excluded.vegetation_coverage,
          elevation_m = excluded.elevation_m, slope_degrees = excluded.slope_degrees,
          drainage_potential = excluded.drainage_potential,
          floodplain_exposure = excluded.floodplain_exposure,
          annual_rainfall_mm = excluded.annual_rainfall_mm,
          warm_season_rainfall_mm = excluded.warm_season_rainfall_mm,
          land_cover_type = excluded.land_cover_type,
          profile_confidence = excluded.profile_confidence,
          source_provenance = excluded.source_provenance,
          data_coverage = excluded.data_coverage, active = true,
          calculated_at = now()
      `;
          await tx`
            UPDATE campground_forecast_schedules
            SET next_refresh_at = now(), updated_at = now()
            WHERE campground_id = ${campground[0].id}::uuid
              AND cadence <> 'paused'
          `;
        });
        processed++;
      }),
    );
  }
  console.log(
    `Processed ${processed} offline habitat profiles using ${input.version}`,
  );
} finally {
  await sqlClient.end();
}
