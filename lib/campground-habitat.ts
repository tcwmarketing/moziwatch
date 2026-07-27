import "server-only";

import { sqlClient } from "@/db";

export type HabitatRings = {
  within250m?: number;
  from250mTo1km?: number;
  from1kmTo3km?: number;
  from1kmTo5km?: number;
};

export type CampgroundHabitatSummary = {
  wetlandCoverage: HabitatRings;
  marshCoverage: HabitatRings;
  seasonalWaterCoverage: HabitatRings;
  forestCoverage: HabitatRings;
  smallWaterBodyDensity: number;
  stagnantWaterPotential: number;
  lakeShorelineProximity: number;
  shorelineWaterEdgeLengthKm: number;
  largeOpenWaterCoverage: number;
  fastRiverProximity: number;
  slowRiverProximity: number;
  vegetationCoverage: number;
  elevationM: number;
  slopeDegrees: number;
  drainagePotential: number;
  floodplainExposure: number;
  annualRainfallMm: number;
  warmSeasonRainfallMm: number;
  landCoverType: string;
  profileConfidence: number;
};

type HabitatRow = {
  wetland_coverage: HabitatRings;
  marsh_coverage: HabitatRings;
  seasonal_water_coverage: HabitatRings;
  forest_coverage: HabitatRings;
  small_water_body_density: number;
  stagnant_water_potential: number;
  lake_shoreline_proximity: number;
  shoreline_water_edge_length_km: number;
  large_open_water_coverage: number;
  fast_river_proximity: number;
  slow_river_proximity: number;
  vegetation_coverage: number;
  elevation_m: number;
  slope_degrees: number;
  drainage_potential: number;
  floodplain_exposure: number;
  annual_rainfall_mm: number;
  warm_season_rainfall_mm: number;
  land_cover_type: string;
  profile_confidence: number;
};

export async function getCampgroundHabitatSummary(campgroundId: string) {
  const rows = await sqlClient<HabitatRow[]>`
    SELECT wetland_coverage, marsh_coverage, seasonal_water_coverage,
      forest_coverage, small_water_body_density, stagnant_water_potential,
      lake_shoreline_proximity, shoreline_water_edge_length_km,
      large_open_water_coverage, fast_river_proximity, slow_river_proximity,
      vegetation_coverage, elevation_m, slope_degrees, drainage_potential,
      floodplain_exposure, annual_rainfall_mm, warm_season_rainfall_mm,
      land_cover_type, profile_confidence
    FROM campground_habitat_profiles
    WHERE campground_id = ${campgroundId}::uuid AND active = true
    LIMIT 1
  `;
  const row = rows[0];
  if (!row) return null;
  return {
    wetlandCoverage: row.wetland_coverage,
    marshCoverage: row.marsh_coverage,
    seasonalWaterCoverage: row.seasonal_water_coverage,
    forestCoverage: row.forest_coverage,
    smallWaterBodyDensity: row.small_water_body_density,
    stagnantWaterPotential: row.stagnant_water_potential,
    lakeShorelineProximity: row.lake_shoreline_proximity,
    shorelineWaterEdgeLengthKm: row.shoreline_water_edge_length_km,
    largeOpenWaterCoverage: row.large_open_water_coverage,
    fastRiverProximity: row.fast_river_proximity,
    slowRiverProximity: row.slow_river_proximity,
    vegetationCoverage: row.vegetation_coverage,
    elevationM: row.elevation_m,
    slopeDegrees: row.slope_degrees,
    drainagePotential: row.drainage_potential,
    floodplainExposure: row.floodplain_exposure,
    annualRainfallMm: row.annual_rainfall_mm,
    warmSeasonRainfallMm: row.warm_season_rainfall_mm,
    landCoverType: row.land_cover_type,
    profileConfidence: row.profile_confidence,
  } satisfies CampgroundHabitatSummary;
}
