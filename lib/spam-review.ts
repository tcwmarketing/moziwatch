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
  return { isSpam: reasons.length > 0, reasons };
}
