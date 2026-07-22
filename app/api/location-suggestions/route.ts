import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { clientIpFromHeaders, isSameOrigin } from "@/lib/privacy";
import { verifyBotProtection } from "@/lib/bot-protection";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";

const input = z.object({
  campgroundId: z.string().uuid().optional(),
  kind: z.enum(["missing", "correction"]),
  name: z.string().trim().max(160).optional(),
  country: z.string().trim().length(2).toUpperCase().optional(),
  region: z.string().trim().max(100).optional(),
  locality: z.string().trim().max(100).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  comment: z.string().trim().min(10).max(1500),
  email: z.string().trim().email().max(254).optional().or(z.literal("")),
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
      { error: "Check the suggestion details." },
      { status: 400 },
    );
  const ip = clientIpFromHeaders(request.headers);
  if (
    !(await verifyBotProtection({
      token: parsed.data.botToken,
      ip,
      userAgent: request.headers.get("user-agent") || "",
      expectedAction: RECAPTCHA_ACTIONS.locationSuggestion,
    }))
  )
    return NextResponse.json(
      { error: "The anti-bot check could not be verified." },
      { status: 400 },
    );
  const value = parsed.data;
  await sqlClient`
    INSERT INTO location_suggestions (
      campground_id, kind, name, country, region, locality, latitude, longitude,
      comment, submitter_email
    ) VALUES (
      ${value.campgroundId || null}::uuid, ${value.kind}, ${value.name || null},
      ${value.country || null}, ${value.region || null}, ${value.locality || null},
      ${value.latitude ?? null}, ${value.longitude ?? null}, ${value.comment},
      ${value.email || null}
    )
  `;
  return NextResponse.json({
    ok: true,
    message: "Your suggestion was sent for review.",
  });
}
