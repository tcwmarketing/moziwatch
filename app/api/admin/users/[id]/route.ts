import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";

const input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("ban"),
    reason: z.string().trim().max(300).optional(),
  }),
  z.object({ action: z.literal("reactivate") }),
]);
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
      { error: "Invalid account action." },
      { status: 400 },
    );
  const { id } = await params;
  if (id === admin.user.id && parsed.data.action === "ban")
    return NextResponse.json(
      { error: "You cannot disable your own account." },
      { status: 409 },
    );
  await sqlClient.begin(async (tx) => {
    const banned = parsed.data.action === "ban";
    await tx`
      UPDATE "user" SET
        disabled_at = CASE WHEN ${banned} THEN now() ELSE NULL END,
        banned = ${banned},
        ban_reason = ${parsed.data.action === "ban" ? parsed.data.reason || "Disabled by administrator" : null},
        ban_expires = NULL,
        updated_at = now()
      WHERE id = ${id}
    `;
    if (banned) await tx`DELETE FROM session WHERE user_id = ${id}`;
    await tx`INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details) VALUES (${admin.user.id}, ${banned ? "ban_user" : "reactivate_user"}, 'user', ${id}, ${toPostgresJson({ banned, reason: parsed.data.action === "ban" ? parsed.data.reason || null : null })}::jsonb)`;
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
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
  const { id } = await params;
  if (id === admin.user.id)
    return NextResponse.json(
      { error: "You cannot delete your own account." },
      { status: 409 },
    );
  const target = await sqlClient<{ role: string }[]>`
    SELECT role FROM "user" WHERE id = ${id} LIMIT 1
  `;
  if (!target[0])
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (target[0].role === "admin")
    return NextResponse.json(
      { error: "Remove administrator access before deleting this account." },
      { status: 409 },
    );
  await sqlClient.begin(async (tx) => {
    await tx`UPDATE reports SET account_id = NULL, updated_at = now() WHERE account_id = ${id}`;
    await tx`DELETE FROM "user" WHERE id = ${id}`;
    await tx`INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details) VALUES (${admin.user.id}, 'delete_user', 'user', ${id}, ${toPostgresJson({ reportsAnonymized: true })}::jsonb)`;
  });
  return NextResponse.json({ ok: true });
}
