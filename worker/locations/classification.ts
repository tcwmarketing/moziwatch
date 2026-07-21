import type { LocationKind } from "./types";

export type CampgroundEvidence = {
  name: string;
  category?: string | null;
  alternateCategories?: string[];
  description?: string | null;
  facilityType?: string | null;
  hasCampingActivity?: boolean;
  hasTentOrMixedSites?: boolean;
  individualSite?: boolean;
  permanentlyClosed?: boolean;
};

export type CampgroundDecision =
  | { accepted: true; locationType: LocationKind }
  | { accepted: false; reason: string };

const clean = (value: string | null | undefined) => value?.trim() || "";
const CAMPGROUND_IDENTITY =
  /\b(campground|camping|camp ?site|forest camp|horse camp|group camp|group site|rv park|recreational vehicle park)\b/i;
const NON_CAMPGROUND_FEATURE =
  /\b(ranger (?:station|district)|public service cent(?:er|re)|visitor cent(?:er|re)|trailhead|(?:ohv )?staging area|day[- ]use(?: area)?|boat (?:launch|ramp)|parking lot|rest area|dump station|scenic overlook)\b/i;

export function obviousNonCampgroundFeature(name: string) {
  return NON_CAMPGROUND_FEATURE.test(name) && !CAMPGROUND_IDENTITY.test(name);
}

/** One centralized, source-independent campground classification policy. */
export function classifyCampground(
  evidence: CampgroundEvidence,
): CampgroundDecision {
  const name = clean(evidence.name);
  const text = `${name} ${clean(evidence.description)} ${clean(evidence.facilityType)}`;
  const categories = [
    clean(evidence.category).toLowerCase(),
    ...(evidence.alternateCategories || []).map((value) => value.toLowerCase()),
  ];

  if (!name) return { accepted: false, reason: "missing_name" };
  if (evidence.permanentlyClosed)
    return { accepted: false, reason: "permanently_closed" };
  if (obviousNonCampgroundFeature(name))
    return { accepted: false, reason: "non_campground_recreation_feature" };
  if (
    evidence.individualSite ||
    /\b(camp ?site|camp ?pitch|site|pitch)\s*#?\s*\d+\b/i.test(name)
  )
    return { accepted: false, reason: "individual_campsite_or_pitch" };

  const exactCampgroundCategory = categories.includes("campground");
  const explicitCamping =
    exactCampgroundCategory ||
    evidence.hasCampingActivity ||
    /\b(campground|camping park|frontcountry camping|backcountry camping)\b/i.test(
      text,
    );
  if (!explicitCamping)
    return { accepted: false, reason: "no_campground_evidence" };

  const rvEvidence = /\b(rv|recreational vehicle|caravan)\b/i.test(text);
  const tentOrMixedEvidence =
    evidence.hasTentOrMixedSites ||
    /\b(tent|walk[- ]?in|backcountry|primitive|mixed camping)\b/i.test(text);
  const rvOnlyEvidence =
    rvEvidence &&
    !tentOrMixedEvidence &&
    /\b(rv park|motorcoach resort|seasonal trailer park|mobile home park)\b/i.test(
      text,
    );
  if (rvOnlyEvidence) return { accepted: false, reason: "rv_only_facility" };

  if (/\bbackcountry|primitive|walk[- ]?in\b/i.test(text))
    return { accepted: true, locationType: "backcountry_campground" };
  if (/\bgroup\b/i.test(text))
    return { accepted: true, locationType: "group_campground" };
  return { accepted: true, locationType: "developed_campground" };
}

export function validWgs84(longitude: number, latitude: number) {
  return (
    Number.isFinite(longitude) &&
    Number.isFinite(latitude) &&
    !(longitude === 0 && latitude === 0) &&
    longitude >= -180 &&
    longitude <= 180 &&
    latitude >= -90 &&
    latitude <= 90
  );
}
