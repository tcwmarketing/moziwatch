import type { RecaptchaAction } from "@/lib/recaptcha-actions";

type Assessment = {
  name?: string;
  tokenProperties?: {
    valid?: boolean;
    invalidReason?: string;
    action?: string;
    hostname?: string;
  };
  riskAnalysis?: { score?: number; reasons?: string[] };
};

export type BotAssessmentResult = {
  provider: "none" | "recaptcha-enterprise";
  accepted: boolean;
  verified: boolean;
  assessmentId: string | null;
  score: number | null;
  reasons: string[];
  action: string | null;
  hostname: string | null;
  invalidReason: string | null;
};

function provider() {
  if (process.env.BOT_PROTECTION_PROVIDER)
    return process.env.BOT_PROTECTION_PROVIDER;
  return process.env.GOOGLE_API_KEY &&
    process.env.GOOGLE_CLOUD_PROJECT_ID &&
    process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
    ? "recaptcha-enterprise"
    : "none";
}

export async function assessBotProtection({
  token,
  ip,
  userAgent,
  expectedAction,
}: {
  token: string | undefined;
  ip: string;
  userAgent: string;
  expectedAction: RecaptchaAction;
}): Promise<BotAssessmentResult> {
  const activeProvider = provider();
  if (activeProvider === "none")
    return {
      provider: "none",
      accepted: true,
      verified: true,
      assessmentId: null,
      score: null,
      reasons: [],
      action: expectedAction,
      hostname: null,
      invalidReason: null,
    };
  if (activeProvider !== "recaptcha-enterprise")
    return failedAssessment("UNKNOWN_PROVIDER");

  const apiKey = process.env.GOOGLE_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!apiKey || !projectId || !siteKey || !token)
    return failedAssessment(token ? "MISSING_CONFIGURATION" : "MISSING");

  try {
    const appOrigin = new URL(
      process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
    ).origin;
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/assessments?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          Referer: `${appOrigin}/`,
        },
        body: JSON.stringify({
          event: {
            token,
            siteKey,
            expectedAction,
            userAgent,
            userIpAddress: ip,
          },
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      console.error("reCAPTCHA Enterprise assessment failed", response.status);
      return failedAssessment(`HTTP_${response.status}`);
    }

    const assessment = (await response.json()) as Assessment;
    const properties = assessment.tokenProperties;
    const result: BotAssessmentResult = {
      provider: "recaptcha-enterprise",
      accepted: false,
      verified: false,
      assessmentId: assessment.name || null,
      score:
        typeof assessment.riskAnalysis?.score === "number"
          ? assessment.riskAnalysis.score
          : null,
      reasons: assessment.riskAnalysis?.reasons || [],
      action: properties?.action || null,
      hostname: properties?.hostname || null,
      invalidReason: properties?.invalidReason || null,
    };
    if (!properties?.valid || properties.action !== expectedAction)
      return result;

    const expectedHostname = new URL(appOrigin).hostname.toLowerCase();
    if (properties.hostname?.toLowerCase() !== expectedHostname) return result;

    const score = result.score;
    const minimumScore = Number(process.env.RECAPTCHA_MIN_SCORE || 0.3);
    return {
      ...result,
      verified: typeof score === "number",
      accepted: typeof score === "number" && score >= minimumScore,
    };
  } catch (error) {
    console.error(
      "reCAPTCHA Enterprise assessment could not be completed",
      error instanceof Error ? error.name : "unknown error",
    );
    return failedAssessment(
      error instanceof Error ? error.name : "ASSESSMENT_ERROR",
    );
  }
}

export async function verifyBotProtection(
  input: Parameters<typeof assessBotProtection>[0],
) {
  return (await assessBotProtection(input)).accepted;
}

export async function annotateBotAssessment(
  assessmentId: string,
  annotation: "LEGITIMATE" | "FRAUDULENT",
) {
  if (!/^projects\/[^/]+\/assessments\/[^/]+$/.test(assessmentId)) return false;
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return false;
  try {
    const response = await fetch(
      `https://recaptchaenterprise.googleapis.com/v1/${assessmentId}:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify({
          annotation,
          ...(annotation === "FRAUDULENT" ? { reasons: ["SOCIAL_SPAM"] } : {}),
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(8_000),
      },
    );
    if (!response.ok) {
      console.error("reCAPTCHA Enterprise annotation failed", response.status);
      return false;
    }
    return true;
  } catch (error) {
    console.error(
      "reCAPTCHA Enterprise annotation could not be completed",
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }
}

function failedAssessment(invalidReason: string): BotAssessmentResult {
  return {
    provider: "recaptcha-enterprise",
    accepted: false,
    verified: false,
    assessmentId: null,
    score: null,
    reasons: [],
    action: null,
    hostname: null,
    invalidReason,
  };
}
