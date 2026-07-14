import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";

const input = z.object({ disabled: z.boolean() });
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
      { error: "Invalid disabled state." },
      { status: 400 },
    );
  const { id } = await params;
  if (id === admin.user.id && parsed.data.disabled)
    return NextResponse.json(
      { error: "You cannot disable your own account." },
      { status: 409 },
    );
  await sqlClient.begin(async (tx) => {
    await tx`UPDATE "user" SET disabled_at = CASE WHEN ${parsed.data.disabled} THEN now() ELSE NULL END, updated_at = now() WHERE id = ${id}`;
    if (parsed.data.disabled)
      await tx`DELETE FROM session WHERE user_id = ${id}`;
    await tx`INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details) VALUES (${admin.user.id}, 'set_user_disabled', 'user', ${id}, ${tx.json({ disabled: parsed.data.disabled })})`;
  });
  return NextResponse.json({ ok: true });
}
