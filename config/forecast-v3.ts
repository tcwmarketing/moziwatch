import type { CampgroundHabitatProfile } from "./forecast";

export type ForecastModelMode = "v2" | "v3-shadow" | "v3";

export type CampgroundV3ModelArtifact = {
  kind: "campground-weather-habitat-report-index";
  status: "experimental";
  version: "mosquito-campground-v3";
  configVersion: string;
  createdAt: string;
  usesRecentUserReports: true;
  usesHistoricalUserReports: true;
  usesWeatherHistory: true;
  usesGeographicHabitat: true;
  habitat: {
    ringWeights: {
      within250m: number;
      from250mTo1km: number;
      from1kmTo3km: number;
    };
    weights: Record<string, number>;
  };
  waterBalance: {
    rainGainPerMm: number;
    snowmeltGainPerMm: number;
    evapotranspirationLossPerMm: number;
    dailyDryLoss: number;
    drainageLoss: number;
    slopeLossPerDegree: number;
    wetHabitatPersistence: number;
    baseCapacity: number;
    wetHabitatCapacity: number;
    flushingThresholdMm: number;
    flushingPenalty: number;
  };
  breeding: {
    waterBalanceWeight: number;
    rainFrequencyWeight: number;
    soilMoistureWeight: number;
    rainfallLagWeight: number;
    soilMoistureDry: number;
    soilMoistureWet: number;
  };
  population: {
    developmentBaseC: number;
    developmentOptimalC: number;
    extremeHeatC: number;
    freezeC: number;
    degreeDayTarget: number;
    minimumOvernightC: number;
    idealDayLengthHours: number;
    snowmeltActivationWeight: number;
  };
  activity: {
    minimumTemperatureC: number;
    optimalTemperatureC: number;
    maximumTemperatureC: number;
    humidityFloorPercent: number;
    humidityCeilingPercent: number;
    windSuppressionStartsKmh: number;
    windStrongKmh: number;
    gustSuppressionStartsKmh: number;
    gustStrongKmh: number;
    rainSuppressionStartsMm: number;
    heavyRainMm: number;
    daylightMultiplier: number;
    twilightWindowHours: number;
  };
  reports: {
    recentDays: number;
    recency: Array<{ maximumAgeDays: number; multiplier: number }>;
    verifiedMultiplier: number;
    anonymousMultiplier: number;
    missingObservationTimeMultiplier: number;
    recentConfidenceScale: number;
    seasonalWindowDays: number;
    historicalAnnualDecay: number;
    historicalConfidenceScale: number;
    historicalYearScale: number;
    historicalMinimumReports: number;
    historicalMinimumYears: number;
  };
  blending: {
    recentMaximum: [number, number, number];
    historicalMaximum: number;
    environmentalMinimum: [number, number, number];
  };
  confidence: {
    weatherCompletenessWeight: number;
    habitatCompletenessWeight: number;
    evidenceAgreementWeight: number;
    horizonPenaltyPerDay: number;
  };
  levels: Array<{ maximum: number; level: number; label: string }>;
  notes: string;
};

export type V3WeatherHistoryDay = {
  date: string;
  temperatureMeanC: number;
  temperatureMinC: number;
  temperatureMaxC: number;
  precipitationMm: number;
  rainMm: number;
  snowfallCm: number;
  snowDepthM: number;
  soilMoisture: number;
  evapotranspirationMm: number;
};

export type V3HourlyWeather = {
  time: string;
  temperatureC: number;
  relativeHumidity: number;
  precipitationMm: number;
  rainMm: number;
  snowfallCm: number;
  snowDepthM: number;
  windSpeedKmh: number;
  windGustKmh: number;
  isDay: boolean;
};

export type CampgroundV3WeatherOutlook = {
  targetDate: string;
  dayOffset: number;
  history: V3WeatherHistoryDay[];
  hourly: V3HourlyWeather[];
  sunrise: string;
  sunset: string;
  weatherRunAt: string;
  completeness: number;
};

export type ForecastReport = {
  id: string;
  rating: number;
  observedAt: Date;
  submittedAt: Date;
  accountVerified: boolean;
  anonymous: boolean;
  moderationStatus: "pending" | "published" | "hidden" | "rejected" | "deleted";
  deletedAt?: Date | null;
  duplicate?: boolean;
  observationTimeKnown?: boolean;
};

export type ReportSignal = {
  signal: number | null;
  reportCount: number;
  effectiveSampleSize: number;
  confidence: number;
  agreement: number;
  representedYears?: number;
  oldestIncludedReport: string | null;
  newestIncludedReport: string | null;
  includedReports: Array<{
    id: string;
    weight: number;
    normalizedRating: number;
  }>;
};

export type EnvironmentalForecast = {
  riskIndex: number;
  level: number;
  label: string;
  habitatSuitability: number;
  breedingCondition: number;
  populationPotential: number;
  activityModifier: number;
  eveningActivity: number;
  dailyPeakActivity: number;
  persistentWaterBalance: number;
  rainfallWindows: {
    days0To2: number;
    days3To7: number;
    days8To14: number;
    days15To30: number;
  };
};

export type V3ForecastResult = {
  modelVersion: string;
  status: "experimental";
  environmentalForecast: EnvironmentalForecast;
  recentReports: ReportSignal & { weight: number };
  historicalReports: ReportSignal & { weight: number };
  finalForecast: { riskIndex: number; level: number; label: string };
  environmentalWeight: number;
  confidence: number;
  confidenceBand: "low" | "medium" | "high";
  confidenceReasons: string[];
  generatedAt: string;
  weatherRunAt: string;
  observed30DayRating: number | null;
  observedHistoricalRating: number | null;
  profile: CampgroundHabitatProfile;
};

export function forecastModelMode(
  value = process.env.FORECAST_MODEL_MODE,
): ForecastModelMode {
  if (!value) return "v3-shadow";
  if (value === "v2" || value === "v3-shadow" || value === "v3") return value;
  throw new Error("FORECAST_MODEL_MODE must be v2, v3-shadow, or v3");
}
