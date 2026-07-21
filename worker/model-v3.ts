import type { CampgroundHabitatProfile, HabitatRings } from "@/config/forecast";
import type {
  CampgroundV3ModelArtifact,
  CampgroundV3WeatherOutlook,
  EnvironmentalForecast,
  ForecastReport,
  ReportSignal,
  V3ForecastResult,
  V3HourlyWeather,
  V3WeatherHistoryDay,
} from "@/config/forecast-v3";

const DAY_MS = 86_400_000;

function clamp(value: number, low = 0, high = 1) {
  return Math.max(low, Math.min(high, value));
}

function scale(value: number, low: number, high: number) {
  if (high <= low) return 0;
  return clamp((value - low) / (high - low));
}

function mean(values: number[]) {
  return values.length
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

export function normalizedReportRating(rating: number) {
  return clamp((rating - 1) * 25, 0, 100);
}

function ringValue(rings: HabitatRings, key: "from1kmTo3km") {
  const compatible = rings as HabitatRings & { from1kmTo3km?: number };
  return compatible[key] ?? rings.from1kmTo5km;
}

function ringScore(model: CampgroundV3ModelArtifact, rings: HabitatRings) {
  return clamp(
    rings.within250m * model.habitat.ringWeights.within250m +
      rings.from250mTo1km * model.habitat.ringWeights.from250mTo1km +
      ringValue(rings, "from1kmTo3km") * model.habitat.ringWeights.from1kmTo3km,
  );
}

function landCoverSuitability(type: string) {
  if (/wetland|marsh|swamp/i.test(type)) return 1;
  if (/forest|wood|shrub/i.test(type)) return 0.7;
  if (/grass|agricultur|cropland/i.test(type)) return 0.42;
  if (/urban|developed|built/i.test(type)) return 0.16;
  if (/barren|rock|snow|ice/i.test(type)) return 0.04;
  return 0.32;
}

export function staticHabitatSuitability(
  model: CampgroundV3ModelArtifact,
  profile: CampgroundHabitatProfile,
) {
  const shorelineLength = clamp((profile.shorelineWaterEdgeLengthKm ?? 0) / 8);
  const factors: Record<string, number> = {
    wetlands: ringScore(model, profile.wetlandCoverage),
    marshes: ringScore(model, profile.marshCoverage),
    seasonalWater: ringScore(model, profile.seasonalWaterCoverage),
    smallWaterBodies: clamp(profile.smallWaterBodyDensity),
    stagnantWater: clamp(profile.stagnantWaterPotential),
    shorelineEdge: Math.max(
      clamp(profile.lakeShorelineProximity) * 0.55,
      shorelineLength,
    ),
    slowRiver: clamp(profile.slowRiverProximity),
    fastRiver: clamp(profile.fastRiverProximity) * 0.25,
    forestVegetation: clamp(
      ringScore(model, profile.forestCoverage) * 0.65 +
        profile.vegetationCoverage * 0.35,
    ),
    poorDrainage: 1 - clamp(profile.drainagePotential),
    landCover: landCoverSuitability(profile.landCoverType),
    floodplain: clamp(profile.floodplainExposure ?? 0),
    largeOpenWater: clamp(profile.largeOpenWaterCoverage) * 0.12,
  };
  const weights = model.habitat.weights;
  const totalWeight = Object.values(weights).reduce(
    (sum, value) => sum + value,
    0,
  );
  const score = Object.entries(weights).reduce(
    (sum, [key, weight]) => sum + (factors[key] ?? 0) * weight,
    0,
  );
  return { score: clamp(score / totalWeight), factors };
}

function rainfallWindows(history: V3WeatherHistoryDay[]) {
  const recent = history.slice(-30).reverse();
  const sumRange = (start: number, end: number) =>
    recent
      .slice(start, end)
      .reduce((total, day) => total + Math.max(0, day.precipitationMm), 0);
  return {
    days0To2: sumRange(0, 3),
    days3To7: sumRange(3, 8),
    days8To14: sumRange(8, 15),
    days15To30: sumRange(15, 30),
  };
}

export function persistentWaterBalance(
  model: CampgroundV3ModelArtifact,
  profile: CampgroundHabitatProfile,
  history: V3WeatherHistoryDay[],
) {
  const wetHabitat = Math.max(
    ringScore(model, profile.wetlandCoverage),
    ringScore(model, profile.marshCoverage),
    ringScore(model, profile.seasonalWaterCoverage),
    profile.stagnantWaterPotential,
  );
  const p = model.waterBalance;
  const capacity = clamp(p.baseCapacity + wetHabitat * p.wetHabitatCapacity);
  let water = Math.min(capacity, wetHabitat * 0.35);
  let previousSnowDepth = history[0]?.snowDepthM ?? 0;
  for (const day of history.slice(-60)) {
    const snowmeltMm =
      day.temperatureMeanC > 0
        ? Math.max(0, previousSnowDepth - day.snowDepthM) * 1_000
        : 0;
    previousSnowDepth = day.snowDepthM;
    const persistence = 1 - wetHabitat * p.wetHabitatPersistence;
    const loss =
      (p.dailyDryLoss +
        day.evapotranspirationMm * p.evapotranspirationLossPerMm +
        profile.drainagePotential * p.drainageLoss +
        profile.slopeDegrees * p.slopeLossPerDegree) *
      persistence;
    water +=
      day.precipitationMm * p.rainGainPerMm +
      snowmeltMm * p.snowmeltGainPerMm -
      loss;
    if (day.precipitationMm >= p.flushingThresholdMm)
      water -= p.flushingPenalty * (0.5 + profile.fastRiverProximity * 0.5);
    water = clamp(water, 0, capacity);
  }
  return { value: water, capacity, wetHabitat };
}

function breedingCondition(
  model: CampgroundV3ModelArtifact,
  profile: CampgroundHabitatProfile,
  history: V3WeatherHistoryDay[],
) {
  const water = persistentWaterBalance(model, profile, history);
  const windows = rainfallWindows(history);
  const recent = history.slice(-30);
  const rainFrequency =
    recent.filter((day) => day.precipitationMm >= 1).length / 30;
  const soilMoisture = scale(
    mean(recent.slice(-7).map((day) => day.soilMoisture)),
    model.breeding.soilMoistureDry,
    model.breeding.soilMoistureWet,
  );
  const lag = clamp(
    (windows.days0To2 * 0.08 +
      windows.days3To7 * 0.22 +
      windows.days8To14 * 0.46 +
      windows.days15To30 * 0.24) /
      35,
  );
  const b = model.breeding;
  const score = clamp(
    water.value * b.waterBalanceWeight +
      rainFrequency * b.rainFrequencyWeight +
      soilMoisture * b.soilMoistureWeight +
      lag * b.rainfallLagWeight,
  );
  return { score, water, windows, rainFrequency, soilMoisture, lag };
}

function hoursBetween(start: string, end: string) {
  const difference = Date.parse(end) - Date.parse(start);
  return Number.isFinite(difference)
    ? clamp(difference / 3_600_000, 0, 24)
    : 12;
}

function populationPotential(
  model: CampgroundV3ModelArtifact,
  weather: CampgroundV3WeatherOutlook,
) {
  const p = model.population;
  const recent = weather.history.slice(-30);
  const degreeDays = recent.reduce((total, day) => {
    const development = clamp(
      (day.temperatureMeanC - p.developmentBaseC) /
        (p.developmentOptimalC - p.developmentBaseC),
    );
    const heat =
      day.temperatureMaxC <= p.extremeHeatC
        ? 1
        : clamp(1 - (day.temperatureMaxC - p.extremeHeatC) / 10);
    return (
      total +
      development *
        heat *
        Math.max(0, day.temperatureMeanC - p.developmentBaseC)
    );
  }, 0);
  const freezeDays = recent.filter(
    (day) => day.temperatureMinC <= p.freezeC,
  ).length;
  const coldNights = recent.filter(
    (day) => day.temperatureMinC < p.minimumOvernightC,
  ).length;
  const extremeHeatDays = recent.filter(
    (day) => day.temperatureMaxC > p.extremeHeatC,
  ).length;
  const priorSnow = recent.at(-8)?.snowDepthM ?? 0;
  const currentSnow = recent.at(-1)?.snowDepthM ?? 0;
  const snowmelt = clamp((priorSnow - currentSnow) * 20);
  const dayLength = hoursBetween(weather.sunrise, weather.sunset);
  const development = clamp(degreeDays / p.degreeDayTarget);
  const survival =
    Math.exp(-freezeDays * 0.38) *
    Math.exp(-coldNights * 0.035) *
    Math.exp(-extremeHeatDays * 0.05);
  const season = scale(dayLength, 8, p.idealDayLengthHours);
  return clamp(
    development * survival * (0.68 + season * 0.32) +
      snowmelt * p.snowmeltActivationWeight * season,
  );
}

function hourlyActivity(
  model: CampgroundV3ModelArtifact,
  hour: V3HourlyWeather,
) {
  const p = model.activity;
  if (hour.temperatureC <= p.minimumTemperatureC) return 0;
  const temperature =
    hour.temperatureC <= p.optimalTemperatureC
      ? scale(hour.temperatureC, p.minimumTemperatureC, p.optimalTemperatureC)
      : 1 -
        scale(hour.temperatureC, p.optimalTemperatureC, p.maximumTemperatureC);
  const moisture = scale(
    hour.relativeHumidity,
    p.humidityFloorPercent,
    p.humidityCeilingPercent,
  );
  const wind =
    1 -
    scale(hour.windSpeedKmh, p.windSuppressionStartsKmh, p.windStrongKmh) * 0.9;
  const gust =
    1 -
    scale(hour.windGustKmh, p.gustSuppressionStartsKmh, p.gustStrongKmh) * 0.75;
  const rain =
    1 -
    scale(hour.precipitationMm, p.rainSuppressionStartsMm, p.heavyRainMm) * 0.9;
  const daylight = hour.isDay ? p.daylightMultiplier : 1;
  return clamp(temperature * moisture * wind * gust * rain * daylight);
}

export function activityForecast(
  model: CampgroundV3ModelArtifact,
  weather: CampgroundV3WeatherOutlook,
) {
  const values = weather.hourly.map((hour) => ({
    time: hour.time,
    value: hourlyActivity(model, hour),
  }));
  const evening = values.filter(({ time }) => {
    const hour = Number(time.slice(11, 13));
    return hour >= 17 && hour <= 23;
  });
  return {
    hourly: values,
    evening: mean(
      (evening.length ? evening : values).map(({ value }) => value),
    ),
    peak: values.length ? Math.max(...values.map(({ value }) => value)) : 0,
  };
}

function levelFor(model: CampgroundV3ModelArtifact, riskIndex: number) {
  const match =
    model.levels.find((level) => riskIndex <= level.maximum) ??
    model.levels.at(-1)!;
  return { level: match.level, label: match.label };
}

export function environmentalForecast(
  model: CampgroundV3ModelArtifact,
  profile: CampgroundHabitatProfile,
  weather: CampgroundV3WeatherOutlook,
): EnvironmentalForecast {
  const habitat = staticHabitatSuitability(model, profile);
  const breeding = breedingCondition(model, profile, weather.history);
  const population = populationPotential(model, weather);
  const activity = activityForecast(model, weather);
  const riskIndex = clamp(
    (habitat.score * breeding.score * population * activity.evening) ** 0.25 *
      100,
    0,
    100,
  );
  return {
    riskIndex,
    ...levelFor(model, riskIndex),
    habitatSuitability: habitat.score,
    breedingCondition: breeding.score,
    populationPotential: population,
    activityModifier: activity.evening,
    eveningActivity: activity.evening,
    dailyPeakActivity: activity.peak,
    persistentWaterBalance: breeding.water.value,
    rainfallWindows: breeding.windows,
  };
}

function effectiveSampleSize(weights: number[]) {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  const squares = weights.reduce((sum, weight) => sum + weight * weight, 0);
  return squares ? (total * total) / squares : 0;
}

function weightedMedian(items: Array<{ value: number; weight: number }>) {
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const half = sorted.reduce((sum, item) => sum + item.weight, 0) / 2;
  let cumulative = 0;
  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= half) return item.value;
  }
  return sorted.at(-1)?.value ?? null;
}

function agreement(items: Array<{ value: number; weight: number }>) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  if (!total) return 0;
  const average =
    items.reduce((sum, item) => sum + item.value * item.weight, 0) / total;
  const variance =
    items.reduce(
      (sum, item) => sum + item.weight * (item.value - average) ** 2,
      0,
    ) / total;
  return clamp(1 - Math.sqrt(variance) / 50);
}

function emptySignal(): ReportSignal {
  return {
    signal: null,
    reportCount: 0,
    effectiveSampleSize: 0,
    confidence: 0,
    agreement: 0,
    oldestIncludedReport: null,
    newestIncludedReport: null,
    includedReports: [],
  };
}

function validReport(report: ForecastReport, generatedAt: Date) {
  return (
    report.moderationStatus === "published" &&
    !report.deletedAt &&
    !report.duplicate &&
    report.submittedAt.getTime() <= generatedAt.getTime() &&
    report.rating >= 1 &&
    report.rating <= 5
  );
}

export function recentReportSignal(
  model: CampgroundV3ModelArtifact,
  reports: ForecastReport[],
  target: Date,
  generatedAt: Date,
) {
  const included = reports.flatMap((report) => {
    if (!validReport(report, generatedAt)) return [];
    const ageDays = (target.getTime() - report.observedAt.getTime()) / DAY_MS;
    if (ageDays < 0 || ageDays > model.reports.recentDays) return [];
    const recency = model.reports.recency.find(
      (window) => ageDays <= window.maximumAgeDays,
    )?.multiplier;
    if (!recency) return [];
    const reporter = report.accountVerified
      ? model.reports.verifiedMultiplier
      : model.reports.anonymousMultiplier;
    const timeMatch = report.observationTimeKnown
      ? 1
      : model.reports.missingObservationTimeMultiplier;
    return [
      {
        report,
        value: normalizedReportRating(report.rating),
        weight: recency * reporter * timeMatch,
      },
    ];
  });
  if (!included.length) return emptySignal();
  const weights = included.map((item) => item.weight);
  const ess = effectiveSampleSize(weights);
  const agreementScore = agreement(included);
  const accountQuality =
    included.reduce(
      (sum, item) =>
        sum +
        item.weight *
          (item.report.accountVerified ? 1 : model.reports.anonymousMultiplier),
      0,
    ) / weights.reduce((sum, weight) => sum + weight, 0);
  const confidence = clamp(
    (1 - Math.exp(-ess / model.reports.recentConfidenceScale)) *
      agreementScore *
      accountQuality *
      model.reports.missingObservationTimeMultiplier,
  );
  const dates = included.map((item) => item.report.observedAt.getTime());
  return {
    signal: weightedMedian(included),
    reportCount: included.length,
    effectiveSampleSize: ess,
    confidence,
    agreement: agreementScore,
    oldestIncludedReport: new Date(Math.min(...dates)).toISOString(),
    newestIncludedReport: new Date(Math.max(...dates)).toISOString(),
    includedReports: included.map((item) => ({
      id: item.report.id,
      weight: item.weight,
      normalizedRating: item.value,
    })),
  } satisfies ReportSignal;
}

function dayOfYear(date: Date) {
  return Math.floor(
    (Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) -
      Date.UTC(date.getUTCFullYear(), 0, 0)) /
      DAY_MS,
  );
}

function seasonalDistance(a: Date, b: Date) {
  const difference = Math.abs(dayOfYear(a) - dayOfYear(b));
  return Math.min(difference, 366 - difference);
}

export function historicalReportSignal(
  model: CampgroundV3ModelArtifact,
  reports: ForecastReport[],
  target: Date,
  generatedAt: Date,
  recentReportIds = new Set<string>(),
) {
  const targetYear = target.getUTCFullYear();
  const included = reports.flatMap((report) => {
    if (!validReport(report, generatedAt) || recentReportIds.has(report.id))
      return [];
    const yearsOld = targetYear - report.observedAt.getUTCFullYear();
    if (yearsOld < 1) return [];
    const distance = seasonalDistance(report.observedAt, target);
    if (distance > model.reports.seasonalWindowDays) return [];
    const seasonalProximity =
      1 - distance / (model.reports.seasonalWindowDays + 1);
    const reporter = report.accountVerified
      ? model.reports.verifiedMultiplier
      : model.reports.anonymousMultiplier;
    return [
      {
        report,
        year: report.observedAt.getUTCFullYear(),
        value: normalizedReportRating(report.rating),
        weight:
          model.reports.historicalAnnualDecay ** yearsOld *
          seasonalProximity *
          reporter,
      },
    ];
  });
  if (!included.length) return { ...emptySignal(), representedYears: 0 };
  const representedYears = new Set(included.map((item) => item.year)).size;
  const weights = included.map((item) => item.weight);
  const ess = effectiveSampleSize(weights);
  const agreementScore = agreement(included);
  const enoughEvidence =
    included.length >= model.reports.historicalMinimumReports &&
    representedYears >= model.reports.historicalMinimumYears;
  const confidence = enoughEvidence
    ? clamp(
        (1 - Math.exp(-ess / model.reports.historicalConfidenceScale)) *
          (1 -
            Math.exp(-representedYears / model.reports.historicalYearScale)) *
          agreementScore,
      )
    : 0;
  const dates = included.map((item) => item.report.observedAt.getTime());
  return {
    signal: weightedMedian(included),
    reportCount: included.length,
    effectiveSampleSize: ess,
    confidence,
    agreement: agreementScore,
    representedYears,
    oldestIncludedReport: new Date(Math.min(...dates)).toISOString(),
    newestIncludedReport: new Date(Math.max(...dates)).toISOString(),
    includedReports: included.map((item) => ({
      id: item.report.id,
      weight: item.weight,
      normalizedRating: item.value,
    })),
  } satisfies ReportSignal;
}

function horizonBand(dayOffset: number) {
  if (dayOffset <= 1) return 0;
  if (dayOffset <= 3) return 1;
  return 2;
}

export function blendForecast(
  model: CampgroundV3ModelArtifact,
  environmental: number,
  recent: ReportSignal,
  historical: ReportSignal,
  dayOffset: number,
) {
  const band = horizonBand(dayOffset);
  let recentWeight = model.blending.recentMaximum[band] * recent.confidence;
  let historicalWeight =
    model.blending.historicalMaximum * historical.confidence;
  const maximumEvidence = 1 - model.blending.environmentalMinimum[band];
  const evidenceTotal = recentWeight + historicalWeight;
  if (evidenceTotal > maximumEvidence) {
    const reduction = maximumEvidence / evidenceTotal;
    recentWeight *= reduction;
    historicalWeight *= reduction;
  }
  const environmentalWeight = 1 - recentWeight - historicalWeight;
  const riskIndex = clamp(
    environmental * environmentalWeight +
      (recent.signal ?? environmental) * recentWeight +
      (historical.signal ?? environmental) * historicalWeight,
    0,
    100,
  );
  return { riskIndex, environmentalWeight, recentWeight, historicalWeight };
}

export function scoreCampgroundV3(
  model: CampgroundV3ModelArtifact,
  profile: CampgroundHabitatProfile,
  weather: CampgroundV3WeatherOutlook,
  reports: ForecastReport[],
  generatedAt: Date,
  observed: { recent: number | null; historical: number | null } = {
    recent: null,
    historical: null,
  },
): V3ForecastResult {
  const target = new Date(`${weather.targetDate}T20:00:00Z`);
  const environmental = environmentalForecast(model, profile, weather);
  const recent = recentReportSignal(model, reports, target, generatedAt);
  const recentIds = new Set(recent.includedReports.map((item) => item.id));
  const historical = historicalReportSignal(
    model,
    reports,
    target,
    generatedAt,
    recentIds,
  );
  const blended = blendForecast(
    model,
    environmental.riskIndex,
    recent,
    historical,
    weather.dayOffset,
  );
  const evidenceAgreement = agreement(
    [
      { value: environmental.riskIndex, weight: blended.environmentalWeight },
      ...(recent.signal === null
        ? []
        : [{ value: recent.signal, weight: blended.recentWeight }]),
      ...(historical.signal === null
        ? []
        : [{ value: historical.signal, weight: blended.historicalWeight }]),
    ].filter((item) => item.weight > 0),
  );
  const habitatCompleteness = clamp(
    profile.dataCoverage?.overall ?? profile.profileConfidence,
  );
  const c = model.confidence;
  const confidence = clamp(
    (weather.completeness * c.weatherCompletenessWeight +
      habitatCompleteness * c.habitatCompletenessWeight +
      evidenceAgreement * c.evidenceAgreementWeight) *
      (1 - Math.min(weather.dayOffset, 7) * c.horizonPenaltyPerDay),
  );
  const reasons: string[] = [];
  if (!recent.reportCount)
    reasons.push("Based mainly on weather and habitat; no recent reports.");
  else if (recent.agreement < 0.65)
    reasons.push("Recent reports are inconsistent.");
  else
    reasons.push(
      `Adjusted ${recent.signal! > environmental.riskIndex ? "upward" : "downward"} using ${recent.reportCount} consistent recent campground report${recent.reportCount === 1 ? "" : "s"}.`,
    );
  if (historical.confidence > 0)
    reasons.push("Historical seasonal reports support the campground outlook.");
  if (habitatCompleteness < 0.6)
    reasons.push(
      "Limited habitat information is available for this campground.",
    );
  if (
    recent.signal !== null &&
    Math.abs(recent.signal - environmental.riskIndex) >= 15
  )
    reasons.push(
      `Recent reports indicate ${recent.signal > environmental.riskIndex ? "higher" : "lower"} activity than the weather estimate.`,
    );
  const finalLevel = levelFor(model, blended.riskIndex);
  return {
    modelVersion: model.version,
    status: model.status,
    environmentalForecast: environmental,
    recentReports: { ...recent, weight: blended.recentWeight },
    historicalReports: { ...historical, weight: blended.historicalWeight },
    finalForecast: { riskIndex: blended.riskIndex, ...finalLevel },
    environmentalWeight: blended.environmentalWeight,
    confidence,
    confidenceBand:
      confidence >= 0.72 ? "high" : confidence >= 0.45 ? "medium" : "low",
    confidenceReasons: reasons.slice(0, 5),
    generatedAt: generatedAt.toISOString(),
    weatherRunAt: weather.weatherRunAt,
    observed30DayRating: observed.recent,
    observedHistoricalRating: observed.historical,
    profile,
  };
}
