import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";

const input = z.object({ active: z.boolean() });
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
    return NextResponse.json(
      { error: "Invalid active state." },
      { status: 400 },
    );
  const { id } = await params;
  await sqlClient.begin(async (tx) => {
    await tx`UPDATE campgrounds SET active = ${parsed.data.active}, updated_at = now() WHERE id = ${id}::uuid`;
    await tx`INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details) VALUES (${admin.user.id}, 'set_campground_active', 'campground', ${id}, ${tx.json({ active: parsed.data.active })})`;
  });
  return NextResponse.json({ ok: true });
}
