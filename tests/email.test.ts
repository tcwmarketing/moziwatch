import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendEmail } from "@/lib/email";

const original = {
  provider: process.env.EMAIL_PROVIDER,
  apiKey: process.env.BREVO_API_KEY,
  from: process.env.EMAIL_FROM,
};

describe("transactional email", () => {
  beforeEach(() => {
    process.env.EMAIL_PROVIDER = "brevo";
    process.env.BREVO_API_KEY = "test-brevo-key";
    process.env.EMAIL_FROM = "MoziWatch <no-reply@moziwatch.com>";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (original.provider === undefined) delete process.env.EMAIL_PROVIDER;
    else process.env.EMAIL_PROVIDER = original.provider;
    if (original.apiKey === undefined) delete process.env.BREVO_API_KEY;
    else process.env.BREVO_API_KEY = original.apiKey;
    if (original.from === undefined) delete process.env.EMAIL_FROM;
    else process.env.EMAIL_FROM = original.from;
  });

  it("sends transactional messages through Brevo without putting secrets in the payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ messageId: "message-123" }), {
        status: 201,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await sendEmail({
      to: "camper@example.com",
      subject: "Verify your email",
      text: "Use this verification link.",
    });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(request.method).toBe("POST");
    expect(request.headers).toMatchObject({
      accept: "application/json",
      "api-key": "test-brevo-key",
      "content-type": "application/json",
    });
    const body = JSON.parse(String(request.body));
    expect(body).toEqual({
      sender: { name: "MoziWatch", email: "no-reply@moziwatch.com" },
      to: [{ email: "camper@example.com" }],
      subject: "Verify your email",
      textContent: "Use this verification link.",
    });
    expect(JSON.stringify(body)).not.toContain("test-brevo-key");
  });

  it("reports a rejected Brevo request without exposing the API key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "sender not authenticated" }), {
          status: 400,
          headers: { "content-type": "application/json" },
        }),
      ),
    );

    const delivery = sendEmail({
      to: "camper@example.com",
      subject: "Reset your password",
      text: "Use this reset link.",
    });
    await expect(delivery).rejects.toThrow(
      "Brevo delivery failed (400): sender not authenticated",
    );
    await expect(delivery).rejects.not.toThrow("test-brevo-key");
  });

  it("requires both the Brevo key and authenticated sender configuration", async () => {
    delete process.env.BREVO_API_KEY;
    await expect(
      sendEmail({ to: "camper@example.com", subject: "Test", text: "Test" }),
    ).rejects.toThrow("BREVO_API_KEY is required");

    process.env.BREVO_API_KEY = "test-brevo-key";
    delete process.env.EMAIL_FROM;
    await expect(
      sendEmail({ to: "camper@example.com", subject: "Test", text: "Test" }),
    ).rejects.toThrow("EMAIL_FROM is required");
  });
});
