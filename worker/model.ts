import type {
  CampgroundBetaForecastModelArtifact,
  CampgroundHabitatProfile,
  CampgroundMonthlyClimate,
  CampgroundMonthlyForecastModelArtifact,
  CampgroundWeatherOutlook,
  HabitatRings,
} from "@/config/forecast";

function clamp(value: number) {
  return Math.max(0, Math.min(1, value));
}

function ringScore(rings: HabitatRings) {
  return clamp(
    rings.within250m * 0.58 +
      rings.from250mTo1km * 0.29 +
      rings.from1kmTo5km * 0.13,
  );
}

function scale(value: number, low: number, high: number) {
  return clamp((value - low) / (high - low));
}

function landCoverSuitability(type: string) {
  const normalized = type.toLowerCase();
  if (/wetland|marsh|swamp/.test(normalized)) return 1;
  if (/forest|wood|shrub/.test(normalized)) return 0.72;
  if (/grass|agricultur|cropland/.test(normalized)) return 0.46;
  if (/urban|developed|built/.test(normalized)) return 0.18;
  if (/barren|rock|snow|ice/.test(normalized)) return 0.05;
  return 0.35;
}

export function habitatSuitability(
  model: CampgroundBetaForecastModelArtifact,
  profile: CampgroundHabitatProfile,
) {
  const w = model.habitatWeights;
  const factors = {
    wetlands: ringScore(profile.wetlandCoverage),
    marshes: ringScore(profile.marshCoverage),
    seasonalWater: ringScore(profile.seasonalWaterCoverage),
    smallWaterBodies: clamp(profile.smallWaterBodyDensity),
    stagnantWater: clamp(profile.stagnantWaterPotential),
    lakeShoreline: clamp(profile.lakeShorelineProximity),
    largeOpenWater: clamp(profile.largeOpenWaterCoverage),
    fastRiver: clamp(profile.fastRiverProximity),
    slowRiver: clamp(profile.slowRiverProximity),
    forestVegetation: clamp(
      ringScore(profile.forestCoverage) * 0.7 +
        profile.vegetationCoverage * 0.3,
    ),
    drainage: 1 - clamp(profile.drainagePotential),
    rainfallClimate: scale(profile.warmSeasonRainfallMm, 80, 650),
    landCover: landCoverSuitability(profile.landCoverType),
  };
  const weightTotal = Object.values(w).reduce((sum, value) => sum + value, 0);
  const score = Object.entries(w).reduce(
    (sum, [key, weight]) => sum + factors[key as keyof typeof factors] * weight,
    0,
  );
  return { score: clamp(score / weightTotal), factors };
}

function weatherSuitability(
  model: CampgroundBetaForecastModelArtifact,
  weather: CampgroundWeatherOutlook,
) {
  const p = model.parameters;
  const w = model.weatherWeights;
  const rainfallLag = clamp(
    (weather.precipitation3dMm * 0.18 +
      weather.precipitation7dMm * 0.48 +
      weather.precipitation14dMm * 0.34) /
      45,
  );
  const factors = {
    temperature:
      weather.temperatureMeanC <= p.coldCutoffC
        ? 0
        : Math.exp(
            -0.5 *
              ((weather.temperatureMeanC - p.temperatureOptimalC) /
                p.temperatureSpreadC) **
                2,
          ),
    overnightLow: scale(weather.overnightLowC, 5, 18),
    humidity: scale(weather.relativeHumidityMean, 38, 90),
    dewPoint: scale(weather.dewPointMeanC, 4, 20),
    rainfallLag,
    soilMoisture: scale(weather.soilMoisture, 0.07, 0.36),
    season: clamp(weather.seasonality),
    evening: clamp(weather.eveningActivity),
  };
  const weightTotal = Object.values(w).reduce((sum, value) => sum + value, 0);
  const base = Object.entries(w).reduce(
    (sum, [key, weight]) => sum + factors[key as keyof typeof factors] * weight,
    0,
  );
  const windSuppression =
    1 -
    scale(weather.windSpeedKmh, p.windSuppressionStartsKmh, p.windStrongKmh) *
      0.7;
  const activeRainSuppression =
    1 -
    scale(weather.activePrecipitationMm, 0, p.activeRainSuppressionMm) * 0.3;
  return {
    score: clamp(
      (base / weightTotal) * windSuppression * activeRainSuppression,
    ),
    factors,
    windSuppression,
    activeRainSuppression,
  };
}

export type CampgroundForecastResult = {
  score: number;
  level: "Low" | "Moderate" | "High" | "Very high";
  confidence: number;
  factors: string[];
  components: Record<string, number>;
};

export function forecastLevel(
  score: number,
): CampgroundForecastResult["level"] {
  if (score < 0.3) return "Low";
  if (score < 0.55) return "Moderate";
  if (score < 0.75) return "High";
  return "Very high";
}

export function scoreCampgroundForecast(
  model: CampgroundBetaForecastModelArtifact,
  profile: CampgroundHabitatProfile,
  weather: CampgroundWeatherOutlook,
): CampgroundForecastResult {
  const habitat = habitatSuitability(model, profile);
  const currentWeather = weatherSuitability(model, weather);
  const score = clamp(
    habitat.score * model.componentWeights.habitat +
      currentWeather.score * model.componentWeights.weather,
  );
  const factors: Array<{ strength: number; text: string }> = [];
  const wetHabitat = Math.max(
    habitat.factors.wetlands,
    habitat.factors.marshes,
    habitat.factors.seasonalWater,
  );
  if (wetHabitat > 0.55)
    factors.push({
      strength: wetHabitat,
      text: "Nearby wetlands, marshes or seasonal water increase breeding habitat.",
    });
  if (
    habitat.factors.largeOpenWater > 0.55 &&
    wetHabitat < habitat.factors.largeOpenWater
  )
    factors.push({
      strength: 0.25,
      text: "Large open water has only a small influence without sheltered wet habitat.",
    });
  if (habitat.factors.forestVegetation > 0.6)
    factors.push({
      strength: habitat.factors.forestVegetation * 0.65,
      text: "Forest and dense vegetation provide sheltered resting habitat.",
    });
  if (currentWeather.factors.rainfallLag > 0.55)
    factors.push({
      strength: currentWeather.factors.rainfallLag,
      text: "Rain over the past one to two weeks increases later breeding potential.",
    });
  if (currentWeather.factors.humidity > 0.65)
    factors.push({
      strength: currentWeather.factors.humidity * 0.8,
      text: "Humid, high-dewpoint conditions support mosquito activity.",
    });
  if (currentWeather.windSuppression < 0.72)
    factors.push({
      strength: 1 - currentWeather.windSuppression + 0.5,
      text: "Strong wind suppresses short-term flying activity.",
    });
  if (weather.overnightLowC < 8)
    factors.push({
      strength: 0.8,
      text: "A cool overnight low suppresses tonight's activity.",
    });
  if (currentWeather.activeRainSuppression < 0.85)
    factors.push({
      strength: 0.62,
      text: "Active rain can temporarily reduce flying activity.",
    });
  if (!factors.length)
    factors.push({
      strength: 0.2,
      text: "Habitat and weather signals are mixed for this period.",
    });
  const horizonConfidence = 1 - Math.min(weather.dayOffset, 7) * 0.045;
  const confidence = clamp(
    (profile.profileConfidence * 0.65 + 0.35) * horizonConfidence,
  );
  return {
    score,
    level: forecastLevel(score),
    confidence,
    factors: factors
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 4)
      .map(({ text }) => text),
    components: {
      habitat: habitat.score,
      weather: currentWeather.score,
      rainfallLag: currentWeather.factors.rainfallLag,
      windSuppression: currentWeather.windSuppression,
      activeRainSuppression: currentWeather.activeRainSuppression,
    },
  };
}

export function scoreCampgroundMonthlyOutlook(
  model: CampgroundMonthlyForecastModelArtifact,
  dailyModel: CampgroundBetaForecastModelArtifact,
  profile: CampgroundHabitatProfile,
  climate: CampgroundMonthlyClimate,
): CampgroundForecastResult {
  const habitat = habitatSuitability(dailyModel, profile);
  const rainfallClimate = scale(profile.warmSeasonRainfallMm, 80, 650);
  const baseline =
    habitat.score * model.componentWeights.habitat +
    clamp(climate.seasonality) * model.componentWeights.season +
    rainfallClimate * model.componentWeights.rainfallClimate;
  const temperatureAdjustment =
    climate.temperatureAnomalyC *
    model.anomalyAdjustments.temperaturePerC *
    clamp(climate.seasonality);
  const precipitationAdjustment =
    Math.tanh(
      climate.precipitationAnomalyMm /
        model.anomalyAdjustments.precipitationScaleMm,
    ) * model.anomalyAdjustments.precipitationMaximum;
  const coldSuppression = scale(climate.temperatureMeanC, 4, 14);
  const score = clamp(
    (baseline + temperatureAdjustment + precipitationAdjustment) *
      coldSuppression,
  );
  const factors: Array<{ strength: number; text: string }> = [];
  const wetHabitat = Math.max(
    habitat.factors.wetlands,
    habitat.factors.marshes,
    habitat.factors.seasonalWater,
  );
  if (wetHabitat > 0.5)
    factors.push({
      strength: wetHabitat,
      text: "Wetlands, marshes or seasonal water raise the campground's monthly baseline.",
    });
  if (habitat.factors.forestVegetation > 0.6)
    factors.push({
      strength: habitat.factors.forestVegetation * 0.7,
      text: "Forest and vegetation provide sheltered mosquito habitat.",
    });
  if (climate.temperatureMeanC < 10)
    factors.push({
      strength: 0.9,
      text: "Cool seasonal temperatures strongly limit mosquito activity.",
    });
  else if (climate.temperatureAnomalyC >= 0.75)
    factors.push({
      strength: Math.min(0.85, 0.45 + climate.temperatureAnomalyC / 8),
      text: "Seasonal guidance is warmer than the long-term model climate.",
    });
  else if (climate.temperatureAnomalyC <= -0.75)
    factors.push({
      strength: Math.min(
        0.85,
        0.45 + Math.abs(climate.temperatureAnomalyC) / 8,
      ),
      text: "Seasonal guidance is cooler than the long-term model climate.",
    });
  if (climate.precipitationAnomalyMm >= 8)
    factors.push({
      strength: Math.min(0.85, 0.45 + climate.precipitationAnomalyMm / 100),
      text: "Seasonal guidance is wetter than the long-term model climate.",
    });
  else if (climate.precipitationAnomalyMm <= -8)
    factors.push({
      strength: Math.min(
        0.85,
        0.45 + Math.abs(climate.precipitationAnomalyMm) / 100,
      ),
      text: "Seasonal guidance is drier than the long-term model climate.",
    });
  if (!factors.length)
    factors.push({
      strength: 0.2,
      text: "The habitat baseline and seasonal guidance are close to typical for this month.",
    });
  const confidence = clamp(
    (profile.profileConfidence * 0.7 + 0.3) *
      model.confidence.regionalResolutionFactor *
      (1 -
        Math.min(climate.monthOffset, 6) *
          model.confidence.monthlyHorizonPenalty),
  );
  return {
    score,
    level: forecastLevel(score),
    confidence,
    factors: factors
      .sort((a, b) => b.strength - a.strength)
      .slice(0, 4)
      .map(({ text }) => text),
    components: {
      habitat: habitat.score,
      season: climate.seasonality,
      rainfallClimate,
      temperatureAnomaly: climate.temperatureAnomalyC,
      precipitationAnomaly: climate.precipitationAnomalyMm,
      coldSuppression,
    },
  };
}
