import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";
import { recalculateCampgroundAggregates } from "@/lib/reports";

const input = z.object({
  status: z.enum(["published", "spam", "hidden", "rejected", "deleted"]),
});

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
  await sqlClient.begin(async (tx) => {
    const current = await tx<
      { campground_id: string; moderation_status: string }[]
    >`SELECT campground_id, moderation_status FROM reports WHERE id = ${id}::uuid FOR UPDATE`;
    if (!current[0]) throw new Error("Report not found");
    await tx`UPDATE reports SET moderation_status = ${parsed.data.status}, deleted_at = CASE WHEN ${parsed.data.status} = 'deleted' THEN now() ELSE NULL END, updated_at = now() WHERE id = ${id}::uuid`;
    await tx`INSERT INTO report_audit (report_id, actor_id, action, previous_status, next_status) VALUES (${id}::uuid, ${admin.user.id}, 'moderation_status_changed', ${current[0].moderation_status}, ${parsed.data.status})`;
    await tx`INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details) VALUES (${admin.user.id}, 'moderate_report', 'report', ${id}, ${toPostgresJson({ from: current[0].moderation_status, to: parsed.data.status })}::jsonb)`;
    await recalculateCampgroundAggregates(tx, current[0].campground_id);
  });
  return NextResponse.json({ ok: true });
}
