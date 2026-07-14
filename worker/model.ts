import type { ForecastFeature, ForecastModelArtifact } from "@/config/forecast";

export type FeatureVector = Record<ForecastFeature, number>;

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function sigmoid(value: number) {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

export function scoreForecast(
  model: ForecastModelArtifact,
  features: FeatureVector,
) {
  if (model.kind === "weather-index-beta") {
    const p = model.parameters;
    const temperature = features.temperature_2m_mean;
    if (temperature <= p.coldCutoffC) return 0;
    const factors = {
      temperature: Math.exp(
        -0.5 *
          ((temperature - p.temperatureOptimalC) / p.temperatureSpreadC) ** 2,
      ),
      humidity: clamp(
        (features.relative_humidity_2m_mean - p.humidityFloorPercent) /
          (p.humidityCeilingPercent - p.humidityFloorPercent),
      ),
      dewPoint: clamp(
        (features.dew_point_2m_mean - p.dewPointFloorC) /
          (p.dewPointCeilingC - p.dewPointFloorC),
      ),
      recentRain:
        1 -
        Math.exp(
          -(features.precipitation_7d + features.precipitation_sum * 0.5) /
            p.precipitationScaleMm,
        ),
      soilMoisture: clamp(
        (features.soil_moisture_0_to_7cm_mean - p.soilMoistureDry) /
          (p.soilMoistureWet - p.soilMoistureDry),
      ),
      lowWind:
        1 -
        clamp(
          (features.wind_speed_10m_mean - p.windCalmKmh) /
            (p.windStrongKmh - p.windCalmKmh),
        ),
    };
    const totalWeight = Object.values(model.weights).reduce(
      (sum, weight) => sum + weight,
      0,
    );
    if (totalWeight <= 0)
      throw new Error("Beta model weights must be positive");
    const score = Object.entries(model.weights).reduce(
      (sum, [key, weight]) =>
        sum + factors[key as keyof typeof factors] * weight,
      0,
    );
    return clamp(score / totalWeight);
  }
  let linear = model.intercept;
  for (const feature of Object.keys(model.coefficients) as ForecastFeature[]) {
    const stats = model.normalization[feature];
    const standardDeviation = stats.standardDeviation || 1;
    linear +=
      model.coefficients[feature] *
      ((features[feature] - stats.mean) / standardDeviation);
  }
  return Math.max(0, Math.min(1, sigmoid(linear)));
}

export function requiredFeatures(model: ForecastModelArtifact) {
  if (model.kind === "weather-index-beta")
    return [
      "temperature_2m_mean",
      "relative_humidity_2m_mean",
      "dew_point_2m_mean",
      "precipitation_sum",
      "precipitation_7d",
      "wind_speed_10m_mean",
      "soil_moisture_0_to_7cm_mean",
    ] satisfies ForecastFeature[];
  return Object.keys(model.coefficients) as ForecastFeature[];
}

export function assertFiniteFeatures(
  features: Partial<FeatureVector>,
  required: ForecastFeature[] = Object.keys(features) as ForecastFeature[],
): asserts features is FeatureVector {
  const invalid = required.find(
    (feature) =>
      typeof features[feature] !== "number" ||
      !Number.isFinite(features[feature]),
  );
  if (invalid) throw new Error(`Missing or invalid model feature: ${invalid}`);
}
