import { NextResponse } from "next/server";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { isSameOrigin } from "@/lib/privacy";
import { campgroundInput } from "@/lib/validation";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const admin = await getApiAdmin(request);
  if (!admin)
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const parsed = campgroundInput.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  const row = parsed.data;
  const inserted = await sqlClient<
    { id: string }[]
  >`INSERT INTO campgrounds (name, slug, address, city, region, country, postal_code, latitude, longitude, website, description, data_source, data_license) VALUES (${row.name}, ${row.slug}, ${row.address}, ${row.city}, ${row.region}, ${row.country}, ${row.postalCode}, ${row.latitude}, ${row.longitude}, ${row.website || null}, ${row.description || null}, 'administrator', 'administrator-supplied') RETURNING id`;
  await sqlClient`INSERT INTO admin_audit_logs (actor_id, action, target_type, target_id) VALUES (${admin.user.id}, 'create_campground', 'campground', ${inserted[0].id})`;
  return NextResponse.json({ id: inserted[0].id }, { status: 201 });
}
