export const FORECAST_FEATURES = [
  "temperature_2m_mean",
  "relative_humidity_2m_mean",
  "dew_point_2m_mean",
  "precipitation_sum",
  "precipitation_7d",
  "wind_speed_10m_mean",
  "soil_moisture_0_to_7cm_mean",
  "elevation",
  "latitude",
  "day_of_year_sin",
  "day_of_year_cos",
  "wetland_proximity",
  "recent_report_signal",
] as const;

export type ForecastFeature = (typeof FORECAST_FEATURES)[number];

export type LogisticForecastModelArtifact = {
  kind: "logistic-regression";
  status: "trained";
  version: string;
  trainedAt: string;
  usesUserReports: boolean;
  temporalHoldout: {
    start: string;
    end: string;
    auc: number | null;
    brier: number;
  };
  intercept: number;
  coefficients: Record<ForecastFeature, number>;
  normalization: Record<
    ForecastFeature,
    { mean: number; standardDeviation: number }
  >;
  notes: string;
};

export type BetaWeatherForecastModelArtifact = {
  kind: "weather-index-beta";
  status: "beta";
  version: string;
  createdAt: string;
  usesUserReports: false;
  evaluation: {
    method: "expert-configured-not-trained";
    auc: null;
    brier: null;
  };
  weights: {
    temperature: number;
    humidity: number;
    dewPoint: number;
    recentRain: number;
    soilMoisture: number;
    lowWind: number;
  };
  parameters: {
    temperatureOptimalC: number;
    temperatureSpreadC: number;
    humidityFloorPercent: number;
    humidityCeilingPercent: number;
    dewPointFloorC: number;
    dewPointCeilingC: number;
    precipitationScaleMm: number;
    soilMoistureDry: number;
    soilMoistureWet: number;
    windCalmKmh: number;
    windStrongKmh: number;
    coldCutoffC: number;
  };
  notes: string;
};

export type ForecastModelArtifact =
  LogisticForecastModelArtifact | BetaWeatherForecastModelArtifact;

export const OPEN_METEO_DAILY_VARIABLES = [
  "temperature_2m_mean",
  "relative_humidity_2m_mean",
  "dew_point_2m_mean",
  "precipitation_sum",
  "wind_speed_10m_mean",
  "soil_moisture_0_to_7cm_mean",
] as const;
