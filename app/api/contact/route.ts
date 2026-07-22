import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { assessBotProtection } from "@/lib/bot-protection";
import {
  clientIpFromHeaders,
  hmacIdentifier,
  isSameOrigin,
} from "@/lib/privacy";
import { reviewSubmissionContent } from "@/lib/spam-review";
import { toPostgresJson } from "@/lib/postgres-json";
import { sendEmail } from "@/lib/email";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";
import { verifyFormProof } from "@/lib/form-proof";
import {
  contactContentFingerprint,
  fingerprintDistance,
} from "@/lib/contact-abuse";

const input = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(254),
  subject: z.string().trim().min(2).max(160),
  message: z.string().trim().min(10).max(3000),
  website: z.string().max(200).optional(),
  formProof: z.string().max(500).optional(),
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
  const botAssessment = await assessBotProtection({
    token: parsed.data.botToken,
    ip,
    userAgent: request.headers.get("user-agent") || "",
    expectedAction: RECAPTCHA_ACTIONS.contact,
  });
  if (!botAssessment.accepted)
    return NextResponse.json(
      { error: "The anti-bot check could not be verified." },
      { status: 400 },
    );
  const ipHash = hmacIdentifier(`contact:${ip}`);
  const normalizedEmail = parsed.data.email.trim().toLowerCase();
  const emailHash = hmacIdentifier(`contact-email:${normalizedEmail}`);
  const recent = await sqlClient<
    { ip_hour: number; ip_day: number; email_day: number }[]
  >`
    SELECT
      count(*) FILTER (
        WHERE ip_hash = ${ipHash} AND created_at >= now() - interval '1 hour'
      )::int AS ip_hour,
      count(*) FILTER (
        WHERE ip_hash = ${ipHash} AND created_at >= now() - interval '1 day'
      )::int AS ip_day,
      count(*) FILTER (
        WHERE email_hash = ${emailHash} AND created_at >= now() - interval '1 day'
      )::int AS email_day
    FROM contact_submissions
    WHERE created_at >= now() - interval '1 day'
  `;
  const maximumIpHour = Number(process.env.CONTACT_MAX_PER_IP_HOUR || 2);
  const maximumIpDay = Number(process.env.CONTACT_MAX_PER_IP_DAY || 5);
  const maximumEmailDay = Number(process.env.CONTACT_MAX_PER_EMAIL_DAY || 3);
  if (
    (recent[0]?.ip_hour || 0) >= maximumIpHour ||
    (recent[0]?.ip_day || 0) >= maximumIpDay ||
    (recent[0]?.email_day || 0) >= maximumEmailDay
  )
    return NextResponse.json(
      { error: "Too many messages were submitted. Please try again later." },
      { status: 429 },
    );
  const combinedContent = `${parsed.data.subject}\n${parsed.data.message}`;
  const review = reviewSubmissionContent(combinedContent);
  const reasons = [...review.reasons];
  const formReview = verifyFormProof(parsed.data.formProof, "contact");
  if (parsed.data.website?.trim()) reasons.push("honeypot-filled");
  if (!formReview.valid) reasons.push(formReview.reason);
  const inboxScore = Number(process.env.CONTACT_RECAPTCHA_INBOX_SCORE || 0.7);
  if (botAssessment.score !== null && botAssessment.score < inboxScore)
    reasons.push("recaptcha-review-score");

  const contentFingerprint = contactContentFingerprint(combinedContent);
  if (contentFingerprint) {
    const recentFingerprints = await sqlClient<
      { content_fingerprint: string }[]
    >`
      SELECT content_fingerprint FROM contact_submissions
      WHERE content_fingerprint IS NOT NULL
        AND created_at >= now() - interval '30 days'
      ORDER BY created_at DESC
      LIMIT 100
    `;
    const maximumDistance = Number(
      process.env.CONTACT_TEMPLATE_HAMMING_DISTANCE || 16,
    );
    if (
      recentFingerprints.some(
        (item) =>
          fingerprintDistance(item.content_fingerprint, contentFingerprint) <=
          maximumDistance,
      )
    )
      reasons.push("repeated-message-template");
  }
  const status = reasons.length ? "spam" : "inbox";
  const [submission] = await sqlClient<{ id: string }[]>`
    INSERT INTO contact_submissions (
      name, email, subject, message, status, spam_reasons, ip_hash, email_hash,
      content_fingerprint, form_proof_valid, bot_provider, bot_verified,
      bot_assessment_id, bot_score, bot_reasons, bot_action, bot_hostname,
      bot_invalid_reason
    ) VALUES (
      ${parsed.data.name}, ${parsed.data.email}, ${parsed.data.subject},
      ${parsed.data.message}, ${status},
      ${toPostgresJson(reasons)}::jsonb, ${ipHash}, ${emailHash},
      ${contentFingerprint}, ${formReview.valid}, ${botAssessment.provider},
      ${botAssessment.verified}, ${botAssessment.assessmentId},
      ${botAssessment.score}, ${toPostgresJson(botAssessment.reasons)}::jsonb,
      ${botAssessment.action}, ${botAssessment.hostname},
      ${botAssessment.invalidReason}
    ) RETURNING id
  `;
  const recipient = process.env.CONTACT_RECIPIENT_EMAIL;
  if (status === "inbox" && recipient) {
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
