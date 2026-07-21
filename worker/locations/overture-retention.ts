import type { NormalizedLocation } from "./types";
import { compactRawPayload } from "./storage-retention";

export const OVERTURE_RETENTION_RULE_VERSION = "overture-retention-v1";
export const OVERTURE_MINIMUM_CONFIDENCE = 0.7;

export type OvertureRetentionReason =
  | "alternate_category_only"
  | "low_source_confidence"
  | "conference_or_retreat_centre"
  | "residential_community"
  | "retail_or_service_business"
  | "non_campground_facility";

type OvertureEvidence = {
  name: string;
  primaryCategory: string | null;
  confidence: number | null;
};

const CONFERENCE_CENTRE =
  /\b(conference|convention|event|wedding|retreat)\s+cent(?:er|re)\b/i;
const RESIDENTIAL =
  /\b(mobile home|manufactured home|residential community|residential park|housing community)\b/i;
const RETAIL_OR_SERVICE =
  /\b(rv dealer|camping store|outdoor store|shoe store|sales and service|repair shop|service cent(?:er|re))\b/i;
const NON_CAMPGROUND_FACILITY =
  /\b(ranger station|public service cent(?:er|re)|visitor cent(?:er|re)|welcome cent(?:er|re)|tourist information cent(?:er|re)|boat launch|boat ramp|trailhead|picnic area|day[- ]use area|parking lot|rest area|dump station|skate park)\b/i;

export function overtureRetentionReason(
  evidence: OvertureEvidence,
): OvertureRetentionReason | null {
  if (evidence.primaryCategory !== "campground")
    return "alternate_category_only";
  if (
    evidence.confidence === null ||
    !Number.isFinite(evidence.confidence) ||
    evidence.confidence < OVERTURE_MINIMUM_CONFIDENCE
  )
    return "low_source_confidence";
  if (CONFERENCE_CENTRE.test(evidence.name))
    return "conference_or_retreat_centre";
  if (RESIDENTIAL.test(evidence.name)) return "residential_community";
  if (NON_CAMPGROUND_FACILITY.test(evidence.name))
    return "non_campground_facility";
  if (RETAIL_OR_SERVICE.test(evidence.name))
    return "retail_or_service_business";
  return null;
}

export function compactOvertureRawPayload(
  raw: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    [
      "primary_category",
      "alternate_categories",
      "confidence",
      "operating_status",
      "version",
    ]
      .map((key) => [key, raw[key]] as const)
      .filter(([, value]) => value !== null && value !== undefined),
  );
}

export function compactLocationRawPayload(record: NormalizedLocation) {
  return compactRawPayload(record.source, record.raw);
}
