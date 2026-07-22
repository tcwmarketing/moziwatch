import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";

describe("security headers", () => {
  it("allows the donation form to continue to Stripe Checkout", async () => {
    const headers = await nextConfig.headers?.();
    const contentSecurityPolicy = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(contentSecurityPolicy).toContain(
      "form-action 'self' https://checkout.stripe.com",
    );
  });

  it("allows the Google AdSense loader", async () => {
    const headers = await nextConfig.headers?.();
    const contentSecurityPolicy = headers
      ?.flatMap((entry) => entry.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;

    expect(contentSecurityPolicy).toContain(
      "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
    );
    expect(contentSecurityPolicy).toContain(
      "https://pagead2.googlesyndication.com",
    );
    expect(contentSecurityPolicy).toContain("https://*.googlesyndication.com");
    expect(contentSecurityPolicy).toContain("https://*.doubleclick.net");
  });
});
