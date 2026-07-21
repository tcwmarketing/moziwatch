import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";

const input = z.object({ action: z.enum(["approve", "dismiss"]) });
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
      { error: "Invalid deletion review action." },
      { status: 400 },
    );

  const updated = await sqlClient.begin(async (tx) => {
    const rows = await tx<
      Array<{ campground_id: string; name: string; slug: string }>
    >`
      SELECT d.campground_id, c.name, c.slug
      FROM location_deletion_candidates d
      JOIN campgrounds c ON c.id = d.campground_id
      WHERE d.id = ${parsedId.data}::uuid AND d.status = 'pending'
      FOR UPDATE OF d, c
    `;
    const candidate = rows[0];
    if (!candidate) return null;
    if (parsed.data.action === "approve") {
      await tx`
        UPDATE campgrounds SET
          active = false,
          operational_status = 'closed',
          verification_status = 'manually_verified',
          manual_locks = ARRAY(
            SELECT DISTINCT unnest(manual_locks || ARRAY['operational_status'])
          ),
          field_provenance = field_provenance || ${toPostgresJson({
            operationalStatus: ["admin-removal-review", 100],
          })}::jsonb,
          updated_at = now()
        WHERE id = ${candidate.campground_id}::uuid
      `;
    }
    const status = parsed.data.action === "approve" ? "approved" : "dismissed";
    await tx`
      UPDATE location_deletion_candidates
      SET status = ${status}::location_deletion_review_status,
        reviewer_id = ${admin.user.id}, reviewed_at = now(), updated_at = now()
      WHERE id = ${parsedId.data}::uuid
    `;
    await tx`
      INSERT INTO admin_audit_logs (
        actor_id, action, target_type, target_id, details
      ) VALUES (
        ${admin.user.id}, 'review_location_deletion_candidate', 'campground',
        ${candidate.campground_id},
        ${toPostgresJson({
          action: parsed.data.action,
          candidateId: parsedId.data,
          name: candidate.name,
          slug: candidate.slug,
        })}::jsonb
      )
    `;
    return candidate;
  });

  if (!updated)
    return NextResponse.json(
      { error: "Deletion candidate is no longer pending." },
      { status: 409 },
    );
  return NextResponse.json({ ok: true });
}
