import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";
import { slugify } from "@/worker/locations/types";
import { applyStoredSourceToCanonical } from "@/worker/locations/importer";

const input = z.object({ action: z.enum(["approve", "reject", "separate"]) });

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
  if (!parsed.success)
    return NextResponse.json(
      { error: "Invalid review action." },
      { status: 400 },
    );
  const { id } = await params;
  await sqlClient.begin(async (tx) => {
    const rows = await tx<
      Array<{
        source_record_id: string;
        suggested_campground_id: string;
        normalized_payload: Record<string, string | null>;
        source: string;
        external_id: string;
        source_priority: number;
      }>
    >`
      SELECT m.source_record_id, m.suggested_campground_id,
        s.normalized_payload, s.source, s.external_id, s.source_priority
      FROM location_merge_candidates m
      JOIN location_source_records s ON s.id = m.source_record_id
      WHERE m.id = ${id}::uuid AND m.status = 'pending' FOR UPDATE
    `;
    const candidate = rows[0];
    if (!candidate) throw new Error("Merge candidate is no longer pending");
    let campgroundId = candidate.suggested_campground_id;
    if (parsed.data.action === "approve") {
      await applyStoredSourceToCanonical(
        tx,
        campgroundId,
        candidate.source_record_id,
      );
    } else if (parsed.data.action === "separate") {
      const value = candidate.normalized_payload;
      const base = slugify(value.name || "campground");
      const slug = `${base.slice(0, 160)}-${candidate.external_id
        .replace(/[^a-z0-9]/gi, "")
        .slice(-8)
        .toLowerCase()}`;
      const provenance = Object.fromEntries(
        [
          "name",
          "locationType",
          "country",
          "region",
          "city",
          "address",
          "coordinates",
          "operator",
          "website",
          "phone",
          "reservationUrl",
        ].map((field) => [
          field,
          [candidate.source, candidate.source_priority],
        ]),
      );
      const inserted = await tx<{ id: string }[]>`
        INSERT INTO campgrounds (
          name, normalized_name, slug, location_type, address, city, region,
          country, postal_code, latitude, longitude, source_geometry,
          operator, website, phone,
          reservation_url, data_source,
          verification_status, field_provenance
        )
        SELECT ${value.name}, ${value.normalizedName}, ${slug},
          ${value.locationType}::location_type, ${value.address}, ${value.locality},
          ${value.region}, ${value.country}, '',
          extensions.st_y(representative_point),
          extensions.st_x(representative_point), source_geometry,
          ${value.operator}, ${value.website},
          ${value.phone}, ${value.reservationUrl}, ${candidate.source},
          ${candidate.source_priority >= 80 ? "source_verified" : "unverified"}::location_verification_status,
          ${toPostgresJson(provenance)}::jsonb
        FROM location_source_records WHERE id = ${candidate.source_record_id}::uuid
        RETURNING id
      `;
      campgroundId = inserted[0].id;
      await tx`
        UPDATE location_source_records SET campground_id = ${campgroundId}::uuid
        WHERE id = ${candidate.source_record_id}::uuid
      `;
    }
    const reviewStatus =
      parsed.data.action === "approve"
        ? "approved"
        : parsed.data.action === "reject"
          ? "rejected"
          : "separate";
    if (parsed.data.action !== "reject") {
      await tx`
        UPDATE location_merge_candidates SET status = 'rejected',
          reviewer_id = ${admin.user.id}, reviewed_at = now()
        WHERE source_record_id = ${candidate.source_record_id}::uuid
          AND id <> ${id}::uuid AND status = 'pending'
      `;
    }
    await tx`
      UPDATE location_merge_candidates SET status = ${reviewStatus},
        reviewer_id = ${admin.user.id}, reviewed_at = now()
      WHERE id = ${id}::uuid
    `;
    await tx`
      INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details)
      VALUES (${admin.user.id}, 'review_location_merge_candidate', 'location_merge_candidate',
        ${id}, ${toPostgresJson({ action: parsed.data.action, campgroundId })}::jsonb)
    `;
  });
  return NextResponse.json({ ok: true });
}
