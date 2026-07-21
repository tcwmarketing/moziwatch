import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { sqlClient } from "@/db";
import { stripeClient } from "@/lib/stripe";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!signature || !webhookSecret)
    return NextResponse.json(
      { error: "Webhook is not configured." },
      { status: 400 },
    );

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      await request.text(),
      signature,
      webhookSecret,
    );
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 400 },
    );
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded" ||
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const session = event.data.object as Stripe.Checkout.Session;
    const paid = session.payment_status === "paid";
    const status = paid
      ? "paid"
      : event.type === "checkout.session.expired"
        ? "expired"
        : event.type === "checkout.session.async_payment_failed"
          ? "failed"
          : "pending";
    await sqlClient`
      INSERT INTO donations (
        checkout_session_id, payment_intent_id, amount_minor, currency,
        status, donor_email, completed_at, updated_at
      ) VALUES (
        ${session.id}, ${typeof session.payment_intent === "string" ? session.payment_intent : null},
        ${session.amount_total || 0}, ${session.currency || "cad"}, ${status},
        ${session.customer_details?.email || null},
        ${paid ? new Date().toISOString() : null}::timestamptz, now()
      )
      ON CONFLICT (checkout_session_id) DO UPDATE SET
        payment_intent_id = excluded.payment_intent_id,
        amount_minor = excluded.amount_minor,
        currency = excluded.currency,
        status = excluded.status,
        donor_email = excluded.donor_email,
        completed_at = coalesce(donations.completed_at, excluded.completed_at),
        updated_at = now()
    `;
  }
  return NextResponse.json({ received: true });
}
