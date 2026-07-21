export type HabitatRings = {
  within250m: number;
  from250mTo1km: number;
  from1kmTo5km: number;
  from1kmTo3km?: number;
};

export type CampgroundHabitatProfile = {
  profileVersion: string;
  dataKind: "representative-prototype" | "measured-geospatial";
  wetlandCoverage: HabitatRings;
  marshCoverage: HabitatRings;
  seasonalWaterCoverage: HabitatRings;
  smallWaterBodyDensity: number;
  stagnantWaterPotential: number;
  lakeShorelineProximity: number;
  shorelineWaterEdgeLengthKm?: number;
  largeOpenWaterCoverage: number;
  fastRiverProximity: number;
  slowRiverProximity: number;
  forestCoverage: HabitatRings;
  vegetationCoverage: number;
  elevationM: number;
  slopeDegrees: number;
  drainagePotential: number;
  floodplainExposure?: number;
  annualRainfallMm: number;
  warmSeasonRainfallMm: number;
  landCoverType: string;
  profileConfidence: number;
  dataCoverage?: {
    overall: number;
    sources: Array<{
      name: string;
      version: string;
      resolution: string;
      processedAt: string;
      coverage: number;
    }>;
  };
};

export type CampgroundWeatherOutlook = {
  targetDate: string;
  dayOffset: number;
  temperatureMeanC: number;
  overnightLowC: number;
  relativeHumidityMean: number;
  dewPointMeanC: number;
  precipitationMm: number;
  precipitation24hMm: number;
  precipitation3dMm: number;
  precipitation7dMm: number;
  precipitation14dMm: number;
  soilMoisture: number;
  windSpeedKmh: number;
  activePrecipitationMm: number;
  seasonality: number;
  eveningActivity: number;
};

export type CampgroundBetaForecastModelArtifact = {
  kind: "campground-habitat-weather-beta";
  status: "beta";
  version: string;
  createdAt: string;
  usesUserReports: false;
  evaluation: {
    method: "expert-configured-prototype-not-trained";
    auc: null;
    brier: null;
  };
  componentWeights: { habitat: number; weather: number };
  habitatWeights: {
    wetlands: number;
    marshes: number;
    seasonalWater: number;
    smallWaterBodies: number;
    stagnantWater: number;
    lakeShoreline: number;
    largeOpenWater: number;
    fastRiver: number;
    slowRiver: number;
    forestVegetation: number;
    drainage: number;
    rainfallClimate: number;
    landCover: number;
  };
  weatherWeights: {
    temperature: number;
    overnightLow: number;
    humidity: number;
    dewPoint: number;
    rainfallLag: number;
    soilMoisture: number;
    season: number;
    evening: number;
  };
  parameters: {
    temperatureOptimalC: number;
    temperatureSpreadC: number;
    coldCutoffC: number;
    windSuppressionStartsKmh: number;
    windStrongKmh: number;
    activeRainSuppressionMm: number;
  };
  notes: string;
};

export type CampgroundMonthlyForecastModelArtifact = {
  kind: "campground-monthly-climatology-seasonal-beta";
  status: "beta";
  version: string;
  createdAt: string;
  usesUserReports: false;
  evaluation: {
    method: "expert-configured-not-trained";
    auc: null;
    brier: null;
  };
  componentWeights: {
    habitat: number;
    season: number;
    rainfallClimate: number;
  };
  anomalyAdjustments: {
    temperaturePerC: number;
    precipitationScaleMm: number;
    precipitationMaximum: number;
  };
  confidence: {
    regionalResolutionFactor: number;
    monthlyHorizonPenalty: number;
  };
  notes: string;
};

export type CampgroundMonthlyClimate = {
  targetMonth: string;
  monthOffset: number;
  seasonality: number;
  temperatureMeanC: number;
  temperatureAnomalyC: number;
  precipitationMm: number;
  precipitationAnomalyMm: number;
};

export const OPEN_METEO_DAILY_VARIABLES = [
  "temperature_2m_mean",
  "temperature_2m_min",
  "relative_humidity_2m_mean",
  "dew_point_2m_mean",
  "precipitation_sum",
  "wind_speed_10m_mean",
] as const;
