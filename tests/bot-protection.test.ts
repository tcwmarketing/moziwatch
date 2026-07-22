import { afterEach, describe, expect, it, vi } from "vitest";
import {
  annotateBotAssessment,
  assessBotProtection,
  verifyBotProtection,
} from "@/lib/bot-protection";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";

const input = {
  token: "single-use-token",
  ip: "203.0.113.10",
  userAgent: "MoziWatch test browser",
  expectedAction: RECAPTCHA_ACTIONS.report,
};

function configureEnterprise() {
  vi.stubEnv("BOT_PROTECTION_PROVIDER", "recaptcha-enterprise");
  vi.stubEnv("GOOGLE_API_KEY", "server-api-key");
  vi.stubEnv("GOOGLE_CLOUD_PROJECT_ID", "moziwatch-project");
  vi.stubEnv("NEXT_PUBLIC_RECAPTCHA_SITE_KEY", "public-site-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://moziwatch.com");
  vi.stubEnv("RECAPTCHA_MIN_SCORE", "0.3");
}

function assessment(
  overrides: {
    valid?: boolean;
    action?: string;
    hostname?: string;
    score?: number;
  } = {},
) {
  return {
    name: "projects/moziwatch-project/assessments/assessment-123",
    tokenProperties: {
      valid: overrides.valid ?? true,
      action: overrides.action ?? RECAPTCHA_ACTIONS.report,
      hostname: overrides.hostname ?? "moziwatch.com",
    },
    riskAnalysis: { score: overrides.score ?? 0.7 },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("reCAPTCHA Enterprise verification", () => {
  it("stays disabled when the provider is explicitly none", async () => {
    vi.stubEnv("BOT_PROTECTION_PROVIDER", "none");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyBotProtection(input)).resolves.toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a valid action-scoped assessment at the configured score", async () => {
    configureEnterprise();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(assessment()), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(verifyBotProtection(input)).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(
      "/v1/projects/moziwatch-project/assessments?key=server-api-key",
    );
    expect(JSON.parse(String(options.body))).toEqual({
      event: {
        token: input.token,
        siteKey: "public-site-key",
        expectedAction: input.expectedAction,
        userAgent: input.userAgent,
        userIpAddress: input.ip,
      },
    });
    expect(new Headers(options.headers).get("Referer")).toBe(
      "https://moziwatch.com/",
    );
  });

  it("returns the assessment provenance needed for moderation", async () => {
    configureEnterprise();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            ...assessment({ score: 0.3 }),
            riskAnalysis: { score: 0.3, reasons: ["AUTOMATION"] },
          }),
          { status: 200 },
        ),
      ),
    );

    await expect(assessBotProtection(input)).resolves.toEqual(
      expect.objectContaining({
        accepted: true,
        verified: true,
        assessmentId: "projects/moziwatch-project/assessments/assessment-123",
        score: 0.3,
        reasons: ["AUTOMATION"],
        action: RECAPTCHA_ACTIONS.report,
        hostname: "moziwatch.com",
      }),
    );
  });

  it("annotates a confirmed spam assessment without exposing the API key", async () => {
    configureEnterprise();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      annotateBotAssessment(
        "projects/moziwatch-project/assessments/assessment-123",
        "FRAUDULENT",
      ),
    ).resolves.toBe(true);
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("/assessments/assessment-123:annotate?key=");
    expect(JSON.parse(String(options.body))).toEqual({
      annotation: "FRAUDULENT",
      reasons: ["SOCIAL_SPAM"],
    });
  });

  it.each([
    ["invalid token", { valid: false }],
    ["wrong action", { action: RECAPTCHA_ACTIONS.contact }],
    ["wrong hostname", { hostname: "attacker.example" }],
    ["low score", { score: 0.1 }],
  ])("rejects an assessment with %s", async (_label, overrides) => {
    configureEnterprise();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(assessment(overrides)), { status: 200 }),
        ),
    );

    await expect(verifyBotProtection(input)).resolves.toBe(false);
  });

  it("fails closed when the assessment service is unavailable", async () => {
    configureEnterprise();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })),
    );

    await expect(verifyBotProtection(input)).resolves.toBe(false);
  });
});
