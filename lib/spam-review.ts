export const RESTRICTED_SPAM_PHRASES = [
  "adult dating",
  "backlink service",
  "binary options",
  "bitcoin investment",
  "buy followers",
  "casino bonus",
  "cheap traffic",
  "crypto investment",
  "domain authority",
  "escort service",
  "forex trading",
  "gambling site",
  "guest post",
  "guaranteed returns",
  "increase your traffic",
  "link building",
  "loan approval",
  "online casino",
  "online pharmacy",
  "payday loan",
  "poker bonus",
  "search engine optimization service",
  "sports betting",
  "viagra",
  "cialis",
  "tramadol",
  "xanax",
  "xxx",
] as const;

const URL_PATTERN =
  /(?:https?:\/\/|hxxps?:\/\/|www\.|\b[a-z0-9][a-z0-9-]{1,62}\s*(?:\.|\[dot\]|\(dot\))\s*(?:com|net|org|io|co|biz|info|xyz|top|site|online|shop|click|live|ru|cn)\b)/i;

const SEARCH_VISIBILITY_PITCH =
  /(?:not|isn.t|is not|was not|doesn.t|does not).{0,80}(?:showing|appearing|ranking|rank).{0,100}(?:search results|google|yahoo|bing)/i;
const OPTIMIZATION_SERVICE_PITCH =
  /\b(?:we|i)\s+(?:can|offer|provide|speciali[sz]e).{0,100}\b(?:seo|aeo|search engine optimization|rank(?:ing)?|website traffic|digital marketing)\b/i;
const WEBSITE_PLATFORMS = [
  "squarespace",
  "shopify",
  "wix",
  "wordpress",
  "godaddy",
] as const;

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export type SubmissionReview = {
  isSpam: boolean;
  reasons: string[];
};

export function reviewSubmissionContent(value: string): SubmissionReview {
  const normalized = normalize(value);
  if (!normalized) return { isSpam: false, reasons: [] };
  const reasons: string[] = [];
  if (URL_PATTERN.test(normalized)) reasons.push("contains-url");
  const matches = RESTRICTED_SPAM_PHRASES.filter((phrase) =>
    normalized.includes(phrase),
  );
  reasons.push(...matches.map((phrase) => `restricted:${phrase}`));
  const solicitationSignals: string[] = [];
  if (SEARCH_VISIBILITY_PITCH.test(normalized))
    solicitationSignals.push("solicitation:search-visibility-pitch");
  if (OPTIMIZATION_SERVICE_PITCH.test(normalized))
    solicitationSignals.push("solicitation:optimization-service");
  const optimizationAcronyms = ["seo", "aeo", "geo"].filter((term) =>
    new RegExp(`\\b${term}\\b`, "i").test(normalized),
  );
  if (optimizationAcronyms.length >= 2)
    solicitationSignals.push("solicitation:optimization-acronyms");
  const platformMatches = WEBSITE_PLATFORMS.filter((platform) =>
    normalized.includes(platform),
  );
  if (platformMatches.length >= 3)
    solicitationSignals.push("solicitation:website-platform-list");
  if (solicitationSignals.length >= 2) reasons.push(...solicitationSignals);
  return { isSpam: reasons.length > 0, reasons };
}
