import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { verifyBotProtection } from "@/lib/bot-protection";
import {
  clientIpFromHeaders,
  hmacIdentifier,
  isSameOrigin,
} from "@/lib/privacy";
import { reviewSubmissionContent } from "@/lib/spam-review";
import { toPostgresJson } from "@/lib/postgres-json";
import { sendEmail } from "@/lib/email";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";

const input = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(3000),
  botToken: z.string().optional(),
});

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      { error: "Check your name, email and message, then try again." },
      { status: 400 },
    );
  const ip = clientIpFromHeaders(request.headers);
  if (
    !(await verifyBotProtection({
      token: parsed.data.botToken,
      ip,
      userAgent: request.headers.get("user-agent") || "",
      expectedAction: RECAPTCHA_ACTIONS.contact,
    }))
  )
    return NextResponse.json(
      { error: "The anti-bot check could not be verified." },
      { status: 400 },
    );
  const ipHash = hmacIdentifier(`contact:${ip}`);
  const recent = await sqlClient<{ count: number }[]>`
    SELECT count(*)::int AS count FROM contact_submissions
    WHERE ip_hash = ${ipHash} AND created_at >= now() - interval '1 hour'
  `;
  if ((recent[0]?.count || 0) >= 5)
    return NextResponse.json(
      { error: "Too many messages were submitted. Please try again later." },
      { status: 429 },
    );
  const review = reviewSubmissionContent(
    `${parsed.data.subject}\n${parsed.data.message}`,
  );
  const status = review.isSpam ? "spam" : "inbox";
  const [submission] = await sqlClient<{ id: string }[]>`
    INSERT INTO contact_submissions (
      name, email, subject, message, status, spam_reasons, ip_hash
    ) VALUES (
      ${parsed.data.name}, ${parsed.data.email}, ${parsed.data.subject},
      ${parsed.data.message}, ${status},
      ${toPostgresJson(review.reasons)}::jsonb, ${ipHash}
    ) RETURNING id
  `;
  const recipient = process.env.CONTACT_RECIPIENT_EMAIL;
  if (!review.isSpam && recipient) {
    await sendEmail({
      to: recipient,
      subject: `MoziWatch contact: ${parsed.data.subject}`,
      text: [
        `Submission: ${submission.id}`,
        `From: ${parsed.data.name}`,
        `Reply email: ${parsed.data.email}`,
        "",
        parsed.data.message,
      ].join("\n"),
    }).catch((error) => console.error("Contact notification failed", error));
  }
  return NextResponse.json({
    ok: true,
    message: "Thanks—your message has been received.",
  });
}
