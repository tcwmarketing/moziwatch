import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";

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
  const updated = await sqlClient<{ id: string }[]>`
    UPDATE contact_submissions SET status = ${parsed.data.status},
      reviewer_id = ${admin.user.id}, reviewed_at = now(), updated_at = now()
    WHERE id = ${id}::uuid RETURNING id
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
  return NextResponse.json({ ok: true });
}
