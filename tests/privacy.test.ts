import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clientIpFromHeaders,
  hmacIdentifier,
  isSameOrigin,
  newAnonymousToken,
  normalizeIp,
} from "@/lib/privacy";

describe("privacy identifiers", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("creates high-entropy first-party tokens", () =>
    expect(newAnonymousToken().length).toBeGreaterThan(40));
  it("normalizes IPv4-mapped IPv6", () =>
    expect(normalizeIp("::FFFF:192.0.2.5")).toBe("192.0.2.5"));
  it("HMACs rather than storing identifiers", () => {
    const secret = "a".repeat(32);
    expect(hmacIdentifier("192.0.2.1", secret)).not.toContain("192.0.2.1");
    expect(hmacIdentifier("192.0.2.1", secret)).toBe(
      hmacIdentifier("192.0.2.1", secret),
    );
  });
  it("does not trust forwarded headers by default", () => {
    vi.stubEnv("TRUST_PROXY_HOPS", "0");
    expect(
      clientIpFromHeaders(
        new Headers({
          "x-real-ip": "192.0.2.10",
          "x-forwarded-for": "203.0.113.4",
        }),
      ),
    ).toBe("192.0.2.10");
  });

  it("accepts the configured public origin behind a reverse proxy", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://moziwatch.com");
    vi.stubEnv("TRUST_PROXY_HOPS", "1");

    const request = new Request(
      "http://127.0.0.1:4288/api/donations/checkout",
      {
        headers: { origin: "https://moziwatch.com" },
      },
    );

    expect(isSameOrigin(request)).toBe(true);
  });

  it("rejects an origin that differs from the configured application URL", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://moziwatch.com");

    const request = new Request("http://127.0.0.1:4288/api/contact", {
      headers: { origin: "https://moziwatch.example" },
    });

    expect(isSameOrigin(request)).toBe(false);
  });

  it("uses trusted forwarded origin details when no app URL is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("TRUST_PROXY_HOPS", "1");

    const request = new Request("http://127.0.0.1:4288/api/contact", {
      headers: {
        origin: "https://moziwatch.com",
        "x-forwarded-host": "moziwatch.com",
        "x-forwarded-proto": "https",
      },
    });

    expect(isSameOrigin(request)).toBe(true);
  });

  it("falls back to the request URL for direct local requests", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "");
    vi.stubEnv("TRUST_PROXY_HOPS", "0");

    const request = new Request("http://localhost:3000/api/contact", {
      headers: { origin: "http://localhost:3000" },
    });

    expect(isSameOrigin(request)).toBe(true);
  });
});
