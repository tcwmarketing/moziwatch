import { NextResponse } from "next/server";
import { z } from "zod";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";
import { normalizeName } from "@/worker/locations/types";

const input = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  operator: z.string().trim().max(200).nullable().optional(),
  website: z.string().url().nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  operationalStatus: z
    .enum(["active", "seasonal", "closed", "review"])
    .optional(),
  locks: z.array(z.string().max(40)).max(30).optional(),
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
    return NextResponse.json(
      { error: "Invalid location update." },
      { status: 400 },
    );
  const { id } = await params;
  const current = await sqlClient<
    Array<{
      name: string;
      operator: string | null;
      website: string | null;
      phone: string | null;
      operational_status: string;
      manual_locks: string[];
      field_provenance: Record<string, unknown>;
    }>
  >`SELECT name, operator, website, phone, operational_status, manual_locks, field_provenance FROM campgrounds WHERE id = ${id}::uuid`;
  if (!current[0])
    return NextResponse.json({ error: "Location not found." }, { status: 404 });
  const value = parsed.data;
  const locks = value.locks || current[0].manual_locks;
  const provenance = { ...current[0].field_provenance };
  for (const field of locks) provenance[field] = ["admin-manual", 100];
  await sqlClient`
    UPDATE campgrounds SET name = ${value.name || current[0].name},
      normalized_name = ${normalizeName(value.name || current[0].name)},
      operator = ${value.operator === undefined ? current[0].operator : value.operator},
      website = ${value.website === undefined ? current[0].website : value.website},
      phone = ${value.phone === undefined ? current[0].phone : value.phone},
      operational_status = ${value.operationalStatus || current[0].operational_status}::location_operational_status,
      active = ${value.operationalStatus ? value.operationalStatus !== "closed" : current[0].operational_status !== "closed"},
      verification_status = 'manually_verified', manual_locks = ${locks},
      field_provenance = ${toPostgresJson(provenance)}::jsonb, updated_at = now()
    WHERE id = ${id}::uuid
  `;
  await sqlClient`
    INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id, details)
    VALUES (${admin.user.id}, 'edit_and_lock_location', 'campground', ${id},
      ${toPostgresJson({ fields: Object.keys(value), locks })}::jsonb)
  `;
  return NextResponse.json({ ok: true });
}
