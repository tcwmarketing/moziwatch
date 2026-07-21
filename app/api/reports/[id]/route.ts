import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sqlClient } from "@/db";
import { isSameOrigin } from "@/lib/privacy";
import { reviewSubmissionContent } from "@/lib/spam-review";
import { toPostgresJson } from "@/lib/postgres-json";
import { recalculateCampgroundAggregates } from "@/lib/reports";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.emailVerified)
    return NextResponse.json(
      { error: "Verified account required." },
      { status: 401 },
    );
  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const comment =
    typeof body.comment === "string"
      ? body.comment.trim().slice(0, 800) || null
      : null;
  const editHours = Math.max(
    1,
    Math.min(72, Number(process.env.REPORT_COMMENT_EDIT_HOURS || 24)),
  );
  const contentReview = reviewSubmissionContent(comment || "");
  const updated = await sqlClient.begin(async (tx) => {
    const rows = await tx<
      { id: string; campground_id: string; moderation_status: string }[]
    >`
      SELECT id, campground_id, moderation_status FROM reports
      WHERE id = ${id}::uuid AND account_id = ${session.user.id}
        AND submitted_at >= now() - (${editHours}::text || ' hours')::interval
        AND deleted_at IS NULL
      FOR UPDATE
    `;
    const current = rows[0];
    if (!current) return [];
    const nextStatus = ["published", "spam"].includes(current.moderation_status)
      ? contentReview.isSpam
        ? "spam"
        : "published"
      : current.moderation_status;
    await tx`
      UPDATE reports SET comment = ${comment}, moderation_status = ${nextStatus},
        spam_reasons = ${toPostgresJson(contentReview.reasons)}::jsonb,
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
    if (nextStatus !== current.moderation_status)
      await recalculateCampgroundAggregates(tx, current.campground_id);
    return [current];
  });
  if (!updated[0])
    return NextResponse.json(
      { error: "The comment editing window has closed." },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}
