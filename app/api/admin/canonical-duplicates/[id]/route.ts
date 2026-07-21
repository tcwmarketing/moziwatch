import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { mergeCanonicalLocations } from "@/lib/location-merge";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";

const input = z.object({ action: z.enum(["approve", "reject", "separate"]) });
const identifier = z.string().uuid();

export async function POST(
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
  const parsedId = identifier.safeParse((await params).id);
  if (!parsed.success || !parsedId.success)
    return NextResponse.json(
      { error: "Invalid duplicate review action." },
      { status: 400 },
    );

  const rows = await sqlClient<
    Array<{
      left_campground_id: string;
      right_campground_id: string;
      suggested_survivor_id: string;
    }>
  >`
    SELECT left_campground_id, right_campground_id, suggested_survivor_id
    FROM canonical_duplicate_candidates
    WHERE id = ${parsedId.data}::uuid AND status = 'pending'
  `;
  const candidate = rows[0];
  if (!candidate)
    return NextResponse.json(
      { error: "Duplicate candidate is no longer pending." },
      { status: 409 },
    );

  if (parsed.data.action === "approve") {
    const duplicateId =
      candidate.suggested_survivor_id === candidate.left_campground_id
        ? candidate.right_campground_id
        : candidate.left_campground_id;
    await mergeCanonicalLocations(
      candidate.suggested_survivor_id,
      duplicateId,
      admin.user.id,
    );
  } else {
    const status = parsed.data.action === "separate" ? "separate" : "rejected";
    const updated = await sqlClient<{ id: string }[]>`
      UPDATE canonical_duplicate_candidates
      SET status = ${status}, reviewer_id = ${admin.user.id},
        reviewed_at = now(), updated_at = now()
      WHERE id = ${parsedId.data}::uuid AND status = 'pending'
      RETURNING id
    `;
    if (!updated[0])
      return NextResponse.json(
        { error: "Duplicate candidate is no longer pending." },
        { status: 409 },
      );
    await sqlClient`
      INSERT INTO admin_audit_logs (
        actor_id, action, target_type, target_id, details
      ) VALUES (
        ${admin.user.id}, 'review_canonical_duplicate',
        'canonical_duplicate_candidate', ${parsedId.data},
        ${toPostgresJson({ action: parsed.data.action })}::jsonb
      )
    `;
  }
  return NextResponse.json({ ok: true });
}
