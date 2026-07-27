import type {
  CampgroundHabitatSummary,
  HabitatRings,
} from "@/lib/campground-habitat";

export type CampgroundFaqItem = {
  question: string;
  answer: string;
};

export function isCampgroundContentIndexable(input: {
  hasHabitat: boolean;
  recentCount: number;
  historicalCount: number;
  forecastAvailable: boolean;
}) {
  return (
    input.hasHabitat ||
    input.recentCount > 0 ||
    input.historicalCount > 0 ||
    input.forecastAvailable
  );
}

type ForecastNight = {
  targetDate: string;
  score: number;
  level: string;
  confidence: number;
};

type CampgroundFaqInput = {
  name: string;
  slug: string;
  city: string;
  region: string;
  recentAverage: number | null;
  recentCount: number;
  historicalAverage: number | null;
  historicalCount: number;
  forecast: ForecastNight | null;
  forecastNights: ForecastNight[];
  habitat: CampgroundHabitatSummary | null;
};

function stableHash(value: string) {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

function pick<T>(values: readonly T[], seed: number, offset = 0) {
  return values[(seed + offset) % values.length];
}

function severityForAverage(average: number | null) {
  if (average === null || !Number.isFinite(average)) return null;
  if (average < 1.5) return "none or minimal";
  if (average < 2.5) return "light";
  if (average < 3.5) return "moderate";
  if (average < 4.5) return "heavy";
  return "severe";
}

function maximumRingValue(rings: HabitatRings) {
  return Math.max(
    0,
    ...Object.values(rings).filter((value): value is number =>
      Number.isFinite(value),
    ),
  );
}

function nearbyRingValue(rings: HabitatRings) {
  return Math.max(rings.within250m || 0, rings.from250mTo1km || 0);
}

function percentage(value: number) {
  if (value <= 0) return "less than 1%";
  if (value < 0.01) return "about 1%";
  return `${Math.round(value * 100)}%`;
}

function forecastIndex(forecast: ForecastNight | null) {
  return forecast
    ? Math.round(Math.max(0, Math.min(1, forecast.score)) * 100)
    : null;
}

function protectionAdvice(input: CampgroundFaqInput) {
  const forecastScore = forecastIndex(input.forecast);
  const reportScore =
    input.recentAverage === null
      ? null
      : Math.round(((input.recentAverage - 1) / 4) * 100);
  const risk = Math.max(forecastScore ?? -1, reportScore ?? -1);
  if (risk < 0)
    return "Pack a dependable personal repellent and lightweight long sleeves even though current severity data are limited. A head net takes little space and is useful insurance if calm, damp evening conditions develop after you arrive.";
  if (risk <= 35)
    return "A standard DEET or picaridin repellent should be the starting point, with long sleeves available for dusk. Wipes or a small spray are usually enough for light activity, but a compact head net is sensible if you will be near shaded vegetation or water.";
  if (risk <= 55)
    return "Bring repellent, long sleeves and trousers, and consider a head net for evening use. A portable fan can help at a picnic table or sheltered campsite because mosquitoes are weak fliers in moving air.";
  if (risk <= 75)
    return "Plan for substantial protection: repellent, covered arms and legs, and a head net or bug shirt. A screened dining shelter can make the campsite much more comfortable when activity remains heavy through the evening.";
  return "Prepare for full physical protection, including effective repellent, long clothing, a head net or bug jacket, and a screened shelter. Severe conditions can make unprotected time outside unpleasant, particularly around dusk and in calm, shaded parts of the campground.";
}

function reportAndForecastAnswer(input: CampgroundFaqInput, seed: number) {
  const recentSeverity = severityForAverage(input.recentAverage);
  const historicalSeverity = severityForAverage(input.historicalAverage);
  const opening = pick(
    [
      `The clearest current picture for ${input.name} comes from comparing recent camper observations with the separate weather-and-habitat forecast.`,
      `Mosquito conditions at ${input.name} are best understood by looking at what campers observed and what the current model expects.`,
      `For ${input.name}, MoziWatch keeps real camper reports beside the modeled outlook so one is never mistaken for the other.`,
    ],
    seed,
  );
  const reports =
    recentSeverity && input.recentCount > 0
      ? `The recent observed rating is ${recentSeverity}, based on ${input.recentCount} published report${input.recentCount === 1 ? "" : "s"} from the latest 30-day period.`
      : `No published camper report falls within the latest 30-day period, so there is not yet a current observed rating for this campground.`;
  const history =
    historicalSeverity && input.historicalCount > 0
      ? `Across the longer report history, the campground's observed rating is ${historicalSeverity} from ${input.historicalCount} published report${input.historicalCount === 1 ? "" : "s"}.`
      : `There is not enough published report history to describe a reliable seasonal pattern yet.`;
  const modeled = input.forecast
    ? `Today's approximate forecast is ${input.forecast.level.toLowerCase()} at ${forecastIndex(input.forecast)}/100, with ${Math.round(input.forecast.confidence * 100)}% evidence confidence.`
    : `A current campground-specific forecast has not been published, so the page does not substitute a regional estimate or assume that missing data mean no mosquitoes.`;
  const comparison =
    input.forecast && input.recentAverage !== null
      ? `The observed rating and forecast remain separate because reports describe what campers encountered, while the forecast estimates expected activity from weather, habitat and eligible report evidence.`
      : `Conditions can change quickly after rain, warming nights or a shift in wind, so checking again shortly before departure is useful.`;
  return [opening, reports, history, modeled, comparison].join(" ");
}

function habitatDrivers(input: CampgroundFaqInput, seed: number) {
  const habitat = input.habitat;
  if (!habitat)
    return [
      `${input.name} does not yet have a complete mapped habitat profile, so MoziWatch avoids inventing a campground-specific water or vegetation explanation.`,
      `Mosquitoes can still become active when warm weather overlaps with recent standing water, damp ground and calm evening conditions around ${input.city || input.region}.`,
      `A future habitat profile will add local detail about wetlands, seasonal water, drainage, vegetation and elevation; until then, camper reports and the current weather display are the most direct evidence.`,
    ].join(" ");

  const nearForest = nearbyRingValue(habitat.forestCoverage);
  const wetland = maximumRingValue(habitat.wetlandCoverage);
  const marsh = maximumRingValue(habitat.marshCoverage);
  const seasonal = maximumRingValue(habitat.seasonalWaterCoverage);
  const elevationFt = Math.round(habitat.elevationM * 3.28084);
  const annualRainfallIn = Math.round(habitat.annualRainfallMm / 25.4);
  const setting = pick(
    [
      `Mapped land cover around ${input.name} is primarily ${habitat.landCoverType}, at roughly ${Math.round(habitat.elevationM).toLocaleString()} metres (${elevationFt.toLocaleString()} feet) elevation.`,
      `${input.name} sits near ${Math.round(habitat.elevationM).toLocaleString()} metres (${elevationFt.toLocaleString()} feet), in surroundings classified mainly as ${habitat.landCoverType}.`,
      `The local habitat profile describes a ${habitat.landCoverType} setting around ${input.name}, with an elevation of about ${Math.round(habitat.elevationM).toLocaleString()} metres (${elevationFt.toLocaleString()} feet).`,
    ],
    seed,
    1,
  );
  const moistureDrivers: string[] = [];
  if (marsh >= 0.01)
    moistureDrivers.push(
      `${percentage(marsh)} mapped marsh coverage in the surrounding analysis area`,
    );
  if (wetland >= 0.01)
    moistureDrivers.push(
      `${percentage(wetland)} mapped wetland coverage in at least one distance ring`,
    );
  if (seasonal >= 0.005)
    moistureDrivers.push(
      `${percentage(seasonal)} seasonal-water coverage in the strongest surrounding ring`,
    );
  if (habitat.smallWaterBodyDensity >= 0.4)
    moistureDrivers.push("a relatively strong small-water signal");
  if (habitat.stagnantWaterPotential >= 0.12)
    moistureDrivers.push(
      "mapped potential for slower-draining or stagnant water",
    );
  const waterSentence = moistureDrivers.length
    ? `Potential breeding habitat includes ${new Intl.ListFormat("en", { style: "long", type: "conjunction" }).format(moistureDrivers)}.`
    : `The mapped profile does not show a strong marsh, wetland or stagnant-water signal immediately around the campground, so temporary rain-filled pockets may matter more than permanent water.`;
  const coverSentence =
    nearForest >= 0.35 || habitat.vegetationCoverage >= 0.7
      ? `Approximately ${percentage(nearForest)} of the closest mapped ring is forested, and vegetation can provide shade and humid resting cover for adult mosquitoes after they emerge.`
      : `The immediate surroundings are comparatively open, offering less shaded resting cover than a densely forested campground.`;
  const climateSentence = `The long-term rainfall baseline is about ${Math.round(habitat.annualRainfallMm).toLocaleString()} millimetres (${annualRainfallIn.toLocaleString()} inches) per year, but recent rainfall and temperature determine whether that background habitat is active now.`;
  const drainageSentence =
    habitat.drainagePotential >= 0.65 || habitat.slopeDegrees >= 10
      ? `Slope and drainage are important counterweights here: the mapped ${habitat.slopeDegrees.toFixed(1)}° slope and relatively quick drainage can limit how long breeding water persists.`
      : `With a mapped slope near ${habitat.slopeDegrees.toFixed(1)}° and slower drainage, rainwater may remain available longer than it would on steep, freely draining terrain.`;
  return [
    setting,
    waterSentence,
    coverSentence,
    climateSentence,
    drainageSentence,
  ].join(" ");
}

function waterAnswer(input: CampgroundFaqInput, seed: number) {
  const habitat = input.habitat;
  const principle = pick(
    [
      `Not every nearby water feature contributes equally to mosquitoes.`,
      `A campground beside water is not automatically a high-mosquito campground.`,
      `The type and persistence of nearby water matter more than simply seeing blue on a map.`,
    ],
    seed,
    2,
  );
  if (!habitat)
    return `${principle} Shallow, warm and slow-moving water generally creates more useful breeding habitat than a deep open lake, ocean shoreline or fast river. Because a completed habitat profile is not available for ${input.name}, current camper reports and weather should carry more weight than assumptions based on the campground name or map position.`;

  const wet = Math.max(
    maximumRingValue(habitat.wetlandCoverage),
    maximumRingValue(habitat.marshCoverage),
    maximumRingValue(habitat.seasonalWaterCoverage),
  );
  const openWater =
    habitat.largeOpenWaterCoverage >= 0.1 ||
    habitat.lakeShorelineProximity >= 0.3;
  const river =
    habitat.fastRiverProximity >= 0.25
      ? "fast"
      : habitat.slowRiverProximity >= 0.25
        ? "slow"
        : null;
  const local =
    wet >= 0.01
      ? `The profile for ${input.name} finds a meaningful wetland, marsh or seasonal-water signal, which is weighted more strongly because shallow and persistent edges can support larvae.`
      : openWater
        ? `${input.name} has a notable lake or open-water relationship, but the model emphasizes shoreline, shallow edges and temporary pools rather than treating the full open-water surface as breeding habitat.`
        : river
          ? `A ${river}-river signal is present near ${input.name}; moving water is not weighted like a marsh, although quiet margins, side channels and floodplain pockets can still matter.`
          : `The profile does not identify a dominant lake, river, marsh or wetland influence immediately around ${input.name}.`;
  return `${principle} ${local} Recent rain, snowmelt and drying conditions can still turn small depressions on or off, which is why the daily outlook combines this static map profile with recent weather history.`;
}

function activityAnswer(input: CampgroundFaqInput, seed: number) {
  const highest = input.forecastNights.reduce<ForecastNight | null>(
    (peak, night) => (!peak || night.score > peak.score ? night : peak),
    null,
  );
  const peakSentence = highest
    ? `Within the current outlook, the highest modeled activity is ${highest.level.toLowerCase()} at ${Math.round(highest.score * 100)}/100 for ${new Date(highest.targetDate).toLocaleDateString("en", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" })}.`
    : `There is no complete multi-night forecast available to identify a particular peak evening right now.`;
  const timing = pick(
    [
      `Mosquito flight and biting are usually most noticeable around dusk and during warm, humid, relatively calm periods.`,
      `For a camper, the most important window is often the transition into evening, especially when the air is warm, damp and not very windy.`,
      `Activity can rise quickly near sunset when temperatures remain mild and wind drops, even if the daytime campsite seemed comfortable.`,
    ],
    seed,
    3,
  );
  const habitat = input.habitat;
  const persistence =
    habitat &&
    (habitat.stagnantWaterPotential >= 0.12 ||
      maximumRingValue(habitat.seasonalWaterCoverage) >= 0.01)
      ? `Because the habitat profile shows water that may persist, rainfall from several days or even a couple of weeks earlier can influence later emergence rather than only the night it falls.`
      : `At this site, a short wet period does not guarantee sustained activity; temperature history and whether small pools remain long enough are also important.`;
  return `${timing} ${peakSentence} Strong wind or active heavy rain can temporarily suppress flying adults, but that short-term relief does not erase mosquitoes already present or the underlying breeding cycle. ${persistence}`;
}

function preparationAnswer(input: CampgroundFaqInput, seed: number) {
  const advice = protectionAdvice(input);
  const locationContext = input.habitat
    ? input.habitat.vegetationCoverage >= 0.7
      ? `The strongly vegetated setting means shaded portions of ${input.name} may feel more active than exposed, breezy areas of the same campground.`
      : `The relatively open setting may offer breezier places to sit, but sheltered pockets can still hold mosquitoes when conditions are calm.`
    : `Without a completed habitat profile, it is wise to pack for one level worse than the limited information suggests.`;
  const closing = pick(
    [
      `Recheck the weather and forecast shortly before leaving, since wind, active rain and overnight temperature can change immediate biting activity.`,
      `Keep protection accessible during setup rather than buried in the vehicle, particularly if you expect to arrive near sunset.`,
      `Conditions often vary within one campground, so choose a breezier campsite when possible and keep repellent available for shaded trails and washroom trips.`,
    ],
    seed,
    4,
  );
  return `${advice} ${locationContext} ${closing}`;
}

function confidenceAnswer(input: CampgroundFaqInput, seed: number) {
  const reports =
    input.recentCount > 0
      ? `${input.recentCount} recent published camper report${input.recentCount === 1 ? " contributes" : "s contribute"} direct observations, while ${input.historicalCount} total historical report${input.historicalCount === 1 ? " provides" : "s provide"} longer-term context.`
      : `There are no published reports from the latest 30 days, so the current page relies more heavily on modeled information and older reports, if any.`;
  const forecast = input.forecast
    ? `The current forecast carries ${Math.round(input.forecast.confidence * 100)}% evidence confidence; that describes the completeness and agreement of its inputs, not the probability that a precise mosquito count will occur.`
    : `No current campground forecast is available, and MoziWatch deliberately labels that absence instead of interpreting it as a low-risk result.`;
  const habitat = input.habitat
    ? `The habitat profile has ${Math.round(input.habitat.profileConfidence * 100)}% data confidence and adds campground-specific context about water, cover, terrain and climate.`
    : `Habitat coverage is still incomplete for this location, which limits how specific the environmental explanation can be.`;
  const closing = pick(
    [
      `The most useful improvement is a fresh report from someone who was actually at ${input.name}, especially when it includes the observation date and a short note about the conditions.`,
      `A new on-site report can confirm or challenge the environmental estimate without overwriting the model or being presented as forecast data.`,
      `Treat the outlook as preparation guidance and the reports as observations; neither is a guarantee that every campsite or hour will feel the same.`,
    ],
    seed,
    5,
  );
  return `${reports} ${forecast} ${habitat} ${closing}`;
}

export function buildCampgroundFaq(
  input: CampgroundFaqInput,
): CampgroundFaqItem[] {
  const seed = stableHash(input.slug);
  return [
    {
      question: `How bad are the mosquitoes at ${input.name}?`,
      answer: reportAndForecastAnswer(input, seed),
    },
    {
      question: `Why are there mosquitoes at ${input.name}?`,
      answer: habitatDrivers(input, seed),
    },
    {
      question: `Does nearby water affect mosquitoes at ${input.name}?`,
      answer: waterAnswer(input, seed),
    },
    {
      question: pick(
        [
          `When are mosquitoes likely to be most active at ${input.name}?`,
          `What time of day are mosquitoes usually worst at ${input.name}?`,
          `Which conditions can increase mosquito activity at ${input.name}?`,
        ],
        seed,
        6,
      ),
      answer: activityAnswer(input, seed),
    },
    {
      question: pick(
        [
          `What mosquito protection should campers bring to ${input.name}?`,
          `How should campers prepare for mosquitoes at ${input.name}?`,
          `What should I pack for mosquito conditions at ${input.name}?`,
        ],
        seed,
        7,
      ),
      answer: preparationAnswer(input, seed),
    },
    {
      question: `How reliable is the mosquito information for ${input.name}?`,
      answer: confidenceAnswer(input, seed),
    },
  ];
}
