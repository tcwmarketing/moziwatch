import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe donations are not configured.");
  const mode = process.env.STRIPE_MODE || "test";
  const testKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  const liveKey = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (mode === "test" && !testKey)
    throw new Error(
      "Stripe is locked to test mode and requires a test-mode key.",
    );
  if (mode === "live" && !liveKey)
    throw new Error("Stripe live mode requires a live-mode key.");
  client ||= new Stripe(key);
  return client;
}
