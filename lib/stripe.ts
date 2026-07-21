import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function stripeClient() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe donations are not configured.");
  const mode = process.env.STRIPE_MODE || "test";
  if (mode === "test" && !key.startsWith("sk_test_"))
    throw new Error(
      "Stripe is locked to test mode and requires an sk_test_ key.",
    );
  if (mode === "live" && !key.startsWith("sk_live_"))
    throw new Error("Stripe live mode requires an sk_live_ key.");
  client ||= new Stripe(key);
  return client;
}
