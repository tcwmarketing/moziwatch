import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sqlClient } from "@/db";
import { isSameOrigin } from "@/lib/privacy";

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
  const updated = await sqlClient<{ id: string }[]>`
    UPDATE reports SET comment = ${comment}, updated_at = now()
    WHERE id = ${id}::uuid AND account_id = ${session.user.id}
      AND submitted_at >= now() - (${editHours}::text || ' hours')::interval
      AND deleted_at IS NULL RETURNING id
  `;
  if (!updated[0])
    return NextResponse.json(
      { error: "The comment editing window has closed." },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}
