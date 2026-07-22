import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Stripe key mode validation", () => {
  it("accepts a restricted live key in live mode", async () => {
    vi.stubEnv("STRIPE_MODE", "live");
    vi.stubEnv("STRIPE_SECRET_KEY", `rk_live_${"a".repeat(48)}`);
    const { stripeClient } = await import("@/lib/stripe");

    expect(stripeClient()).toBeDefined();
  });

  it("rejects a test key in live mode", async () => {
    vi.stubEnv("STRIPE_MODE", "live");
    vi.stubEnv("STRIPE_SECRET_KEY", `rk_test_${"a".repeat(48)}`);
    const { stripeClient } = await import("@/lib/stripe");

    expect(() => stripeClient()).toThrow("requires a live-mode key");
  });
});
