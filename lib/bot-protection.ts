import type { RecaptchaAction } from "@/lib/recaptcha-actions";

type Assessment = {
  tokenProperties?: {
    valid?: boolean;
    action?: string;
    hostname?: string;
  };
  riskAnalysis?: { score?: number; reasons?: string[] };
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

export async function verifyBotProtection({
  token,
  ip,
  userAgent,
  expectedAction,
}: {
  token: string | undefined;
  ip: string;
  userAgent: string;
  expectedAction: RecaptchaAction;
}) {
  const activeProvider = provider();
  if (activeProvider === "none") return true;
  if (activeProvider !== "recaptcha-enterprise") return false;

  const apiKey = process.env.GOOGLE_API_KEY;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (!apiKey || !projectId || !siteKey || !token) return false;

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
      return false;
    }

    const assessment = (await response.json()) as Assessment;
    const properties = assessment.tokenProperties;
    if (!properties?.valid || properties.action !== expectedAction)
      return false;

    const expectedHostname = new URL(appOrigin).hostname.toLowerCase();
    if (properties.hostname?.toLowerCase() !== expectedHostname) return false;

    const score = assessment.riskAnalysis?.score;
    const minimumScore = Number(process.env.RECAPTCHA_MIN_SCORE || 0.3);
    return typeof score === "number" && score >= minimumScore;
  } catch (error) {
    console.error(
      "reCAPTCHA Enterprise assessment could not be completed",
      error instanceof Error ? error.name : "unknown error",
    );
    return false;
  }
}
