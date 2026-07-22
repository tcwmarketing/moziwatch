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
});
