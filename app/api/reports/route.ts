import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { verifyBotProtection } from "@/lib/bot-protection";
import {
  ANONYMOUS_TOKEN_COOKIE,
  clientIpFromHeaders,
  hmacIdentifier,
  isSameOrigin,
  newAnonymousToken,
} from "@/lib/privacy";
import {
  createReport,
  DuplicateReportError,
  ReportRateLimitError,
} from "@/lib/reports";
import { reportInput } from "@/lib/validation";
import { RECAPTCHA_ACTIONS } from "@/lib/recaptcha-actions";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );

  const parsed = reportInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json(
      {
        error:
          "Check the rating, observation date and comment, then try again.",
      },
      { status: 400 },
    );

  const ip = clientIpFromHeaders(request.headers);
  if (
    !(await verifyBotProtection({
      token: parsed.data.botToken,
      ip,
      userAgent: request.headers.get("user-agent") || "",
      expectedAction: RECAPTCHA_ACTIONS.report,
    }))
  ) {
    return NextResponse.json(
      { error: "The anti-bot check could not be verified." },
      { status: 400 },
    );
  }

  const session = await auth.api.getSession({ headers: request.headers });
  if (session?.user && !session.user.emailVerified) {
    return NextResponse.json(
      {
        error:
          "Verify your email before using account features. You can also sign out and report anonymously.",
      },
      { status: 403 },
    );
  }
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(ANONYMOUS_TOKEN_COOKIE)?.value;
  const anonymousToken = session?.user
    ? null
    : existingToken || newAnonymousToken();

  try {
    const observedOn =
      parsed.data.observationMode === "older"
        ? parsed.data.observedOn!
        : new Date().toISOString().slice(0, 10);
    const report = await createReport({
      campgroundId: parsed.data.campgroundId,
      rating: parsed.data.rating,
      comment: parsed.data.comment,
      accountId: session?.user.id ?? null,
      anonymousTokenHash: anonymousToken
        ? hmacIdentifier(`anonymous:${anonymousToken}`)
        : null,
      ipHash: hmacIdentifier(`ip:${ip}`),
      observedOn,
    });
    const response = NextResponse.json({ ok: true, report });
    if (!existingToken && anonymousToken) {
      response.cookies.set(ANONYMOUS_TOKEN_COOKIE, anonymousToken, {
        httpOnly: true,
        sameSite: "strict",
        secure: process.env.NODE_ENV === "production",
        maxAge: 365 * 24 * 60 * 60,
        path: "/",
      });
    }
    return response;
  } catch (error) {
    if (error instanceof DuplicateReportError) {
      return NextResponse.json(
        {
          error: `A report was already received for this campground. You can report again after ${error.retryAt.toLocaleString()}.`,
          retryAt: error.retryAt,
        },
        { status: 409 },
      );
    }
    if (error instanceof ReportRateLimitError)
      return NextResponse.json({ error: error.message }, { status: 429 });
    console.error("Report submission failed", error);
    return NextResponse.json(
      { error: "The report could not be saved. Please try again." },
      { status: 500 },
    );
  }
}
