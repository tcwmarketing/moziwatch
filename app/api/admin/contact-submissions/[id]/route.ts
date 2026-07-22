import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";
import { annotateBotAssessment } from "@/lib/bot-protection";

const input = z.object({ status: z.enum(["inbox", "spam", "archived"]) });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const admin = await getApiAdmin(request);
  if (!admin)
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const parsed = input.safeParse(await request.json().catch(() => null));
  if (!parsed.success)
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  const { id } = await params;
  const updated = await sqlClient<
    { id: string; bot_assessment_id: string | null }[]
  >`
    UPDATE contact_submissions SET status = ${parsed.data.status},
      reviewer_id = ${admin.user.id}, reviewed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid RETURNING id, bot_assessment_id
  `;
  if (!updated[0])
    return NextResponse.json(
      { error: "Submission not found." },
      { status: 404 },
    );
  await sqlClient`
    INSERT INTO admin_audit_logs (
      actor_id, action, target_type, target_id, details
    ) VALUES (
      ${admin.user.id}, 'moderate_contact', 'contact_submission', ${id},
      ${toPostgresJson({ status: parsed.data.status })}::jsonb
    )
  `;
  const annotation =
    parsed.data.status === "spam"
      ? "FRAUDULENT"
      : parsed.data.status === "inbox"
        ? "LEGITIMATE"
        : null;
  const annotationSynced =
    annotation && updated[0].bot_assessment_id
      ? await annotateBotAssessment(updated[0].bot_assessment_id, annotation)
      : false;
  if (annotationSynced) {
    await sqlClient`
      UPDATE contact_submissions
      SET bot_annotation = ${annotation}, bot_annotated_at = now(),
        updated_at = now()
      WHERE id = ${id}::uuid
    `;
  }
  return NextResponse.json({ ok: true, annotationSynced });
}
