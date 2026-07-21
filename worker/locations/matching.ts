import {
  normalizePhone,
  websiteDomain,
  type NormalizedLocation,
} from "./types";

const SHARED_PROVIDER_DOMAINS = new Set([
  "bcparks.ca",
  "koa.com",
  "nps.gov",
  "recreation.gov",
  "sitesandtrailsbc.ca",
]);

const CAMPGROUND_NAME_FILLER_WORDS = new Set([
  "a",
  "and",
  "at",
  "by",
  "camp",
  "campground",
  "campgrounds",
  "camping",
  "campsite",
  "campsites",
  "cabin",
  "cabins",
  "family",
  "holiday",
  "koa",
  "of",
  "park",
  "resort",
  "rv",
  "the",
]);

export function campgroundNameIdentityTokens(value: string) {
  return [
    ...new Set(
      value
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .split(/\s+/)
        .filter(
          (token) =>
            (token.length > 1 || /^\d+$/.test(token)) &&
            !CAMPGROUND_NAME_FILLER_WORDS.has(token),
        ),
    ),
  ];
}

export function campgroundNameIdentitySimilarity(left: string, right: string) {
  const leftTokens = campgroundNameIdentityTokens(left);
  const rightTokens = campgroundNameIdentityTokens(right);
  if (!leftTokens.length || !rightTokens.length) return 0;
  const rightSet = new Set(rightTokens);
  const intersection = leftTokens.filter((token) => rightSet.has(token)).length;
  if (!intersection) return 0;
  const containment =
    intersection / Math.min(leftTokens.length, rightTokens.length);
  const union = new Set([...leftTokens, ...rightTokens]).size;
  const jaccard = intersection / union;
  return Math.min(1, containment * 0.85 + jaccard * 0.15);
}

export function campgroundWebsiteIdentity(value: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const parameters = [...url.searchParams.entries()]
      .filter(
        ([key]) =>
          !key.toLowerCase().startsWith("utm_") &&
          !["fbclid", "gclid", "msclkid"].includes(key.toLowerCase()),
      )
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        `${leftKey}=${leftValue}`.localeCompare(`${rightKey}=${rightValue}`),
      );
    const search = parameters.length
      ? `?${new URLSearchParams(parameters).toString().toLowerCase()}`
      : "";
    return `${url.hostname.toLowerCase().replace(/^www\./, "")}${url.pathname
      .replace(/\/+$/, "")
      .toLowerCase()}${search}`;
  } catch {
    return null;
  }
}

function configuredNumber(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) ? value : fallback;
}

export const MATCH_THRESHOLDS = {
  automatic: configuredNumber("LOCATION_MATCH_AUTOMATIC_THRESHOLD", 0.9),
  review: configuredNumber("LOCATION_MATCH_REVIEW_THRESHOLD", 0.62),
  maxDistanceMeters: configuredNumber(
    "LOCATION_MATCH_MAX_DISTANCE_METERS",
    50_000,
  ),
};

export type MatchCandidate = {
  id: string;
  name: string;
  normalizedName: string;
  country: string;
  region: string;
  address: string;
  website: string | null;
  phone: string | null;
  operator: string | null;
  parentName: string | null;
  distanceMeters: number;
  nameSimilarity: number;
};

export function scoreLocationMatch(
  incoming: NormalizedLocation,
  candidate: MatchCandidate,
) {
  if (incoming.country !== candidate.country)
    return {
      score: 0,
      reasons: ["different country"],
      websiteMatch: false,
      phoneMatch: false,
      nameSimilarity: 0,
    };
  const reasons: string[] = [];
  const incomingDomain = websiteDomain(incoming.website);
  const candidateDomain = websiteDomain(candidate.website);
  const websiteMatch = Boolean(
    incomingDomain &&
    incomingDomain === candidateDomain &&
    (!SHARED_PROVIDER_DOMAINS.has(incomingDomain) ||
      campgroundWebsiteIdentity(incoming.website) ===
        campgroundWebsiteIdentity(candidate.website)),
  );
  const phoneMatch = Boolean(
    normalizePhone(incoming.phone) &&
    normalizePhone(incoming.phone) === normalizePhone(candidate.phone),
  );
  const compatibleRegion =
    !incoming.region ||
    !candidate.region ||
    incoming.region.toLowerCase() === candidate.region.toLowerCase();
  const addressMatch = Boolean(
    incoming.address &&
    candidate.address &&
    incoming.address !== "Address not provided" &&
    incoming.address.toLowerCase().replace(/\W/g, "") ===
      candidate.address.toLowerCase().replace(/\W/g, ""),
  );
  const close = candidate.distanceMeters <= 350;
  const identitySimilarity = campgroundNameIdentitySimilarity(
    incoming.name,
    candidate.name,
  );
  const nameSimilarity = Math.max(
    Math.min(1, Math.max(0, candidate.nameSimilarity)),
    identitySimilarity,
  );
  let score = nameSimilarity * 0.45;
  score += Math.max(0, 1 - candidate.distanceMeters / 5_000) * 0.25;
  if (websiteMatch) {
    score += 0.5;
    reasons.push("same website domain");
  }
  if (phoneMatch) {
    score += 0.5;
    reasons.push("same phone number");
  }
  if (addressMatch) {
    score += 0.15;
    reasons.push("same normalized address");
  }
  if (nameSimilarity >= 0.9 && close) {
    score += 0.25;
    reasons.push("strong name and very close coordinates");
  }
  if (
    incoming.operator &&
    candidate.operator &&
    incoming.operator.toLowerCase() === candidate.operator.toLowerCase()
  ) {
    score += 0.08;
    reasons.push("same operator");
  }
  if (
    incoming.parentName &&
    candidate.parentName &&
    incoming.parentName.toLowerCase() === candidate.parentName.toLowerCase()
  ) {
    score += 0.08;
    reasons.push("same parent park");
  }
  if (!compatibleRegion) score -= 0.25;
  if (identitySimilarity > candidate.nameSimilarity + 0.1)
    reasons.push("equivalent campground name terms");
  else if (nameSimilarity >= 0.75) reasons.push("similar normalized name");
  if (close) reasons.push("coordinates within 350 metres");
  else if (candidate.distanceMeters <= 2_000)
    reasons.push("coordinates within 2 kilometres");
  return {
    score: Math.max(0, Math.min(1, score)),
    reasons,
    websiteMatch,
    phoneMatch,
    nameSimilarity,
  };
}
