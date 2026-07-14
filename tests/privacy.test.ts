import { describe, expect, it } from "vitest";
import {
  clientIpFromHeaders,
  hmacIdentifier,
  newAnonymousToken,
  normalizeIp,
} from "@/lib/privacy";

describe("privacy identifiers", () => {
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
    process.env.TRUST_PROXY_HOPS = "0";
    expect(
      clientIpFromHeaders(
        new Headers({
          "x-real-ip": "192.0.2.10",
          "x-forwarded-for": "203.0.113.4",
        }),
      ),
    ).toBe("192.0.2.10");
  });
});
