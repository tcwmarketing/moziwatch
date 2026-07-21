import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { publicEnv } from "@/lib/env";
import { isSameOrigin } from "@/lib/privacy";
import { stripeClient } from "@/lib/stripe";

const amountSchema = z.coerce.number().finite().min(1).max(500);

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );

  const form = await request.formData();
  const selected = String(form.get("suggestedAmount") || "");
  const rawAmount = selected === "custom" ? form.get("customAmount") : selected;
  const parsed = amountSchema.safeParse(rawAmount);
  if (!parsed.success)
    return NextResponse.redirect(
      new URL("/support?status=invalid", publicEnv.appUrl),
      303,
    );

  const amountMinor = Math.round(parsed.data * 100);
  const currency = (
    process.env.STRIPE_DONATION_CURRENCY || "cad"
  ).toLowerCase();
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "payment",
      success_url: `${publicEnv.appUrl}/support/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${publicEnv.appUrl}/support?status=cancelled`,
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinor,
            product_data: {
              name: "Support MoziWatch",
              description:
                "A voluntary contribution toward clearer campground mosquito information.",
            },
          },
        },
      ],
      metadata: { kind: "venture-donation" },
      payment_intent_data: { metadata: { kind: "venture-donation" } },
    });
    if (!session.url) throw new Error("Stripe did not return a checkout URL.");
    await sqlClient`
      INSERT INTO donations (
        checkout_session_id, amount_minor, currency, status
      ) VALUES (${session.id}, ${amountMinor}, ${currency}, 'pending')
      ON CONFLICT (checkout_session_id) DO NOTHING
    `;
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Donation checkout could not be created", error);
    return NextResponse.redirect(
      new URL("/support?status=unavailable", publicEnv.appUrl),
      303,
    );
  }
}
