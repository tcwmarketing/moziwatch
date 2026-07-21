import { NextResponse } from "next/server";
import { sqlClient } from "@/db";
import { getApiAdmin } from "@/lib/api-admin";
import { flagLikelyDuplicates, parseCampgroundCsv } from "@/lib/csv-import";
import { isSameOrigin } from "@/lib/privacy";
import { toPostgresJson } from "@/lib/postgres-json";
import { campgroundInput } from "@/lib/validation";
import { normalizeName } from "@/worker/locations/types";

export async function POST(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json({ error: "Invalid origin." }, { status: 403 });
  const admin = await getApiAdmin(request);
  if (!admin)
    return NextResponse.json(
      { error: "Administrator access required." },
      { status: 403 },
    );
  const body = await request.json().catch(() => null);
  if (body?.action === "preview" && typeof body.csv === "string") {
    const parsed = parseCampgroundCsv(body.csv);
    const existing = await sqlClient<
      { id: string; name: string; latitude: number; longitude: number }[]
    >`SELECT id, name, latitude, longitude FROM campgrounds`;
    const valid = flagLikelyDuplicates(parsed.valid, existing);
    await sqlClient`INSERT INTO campground_imports (actor_id, filename, summary, rows) VALUES (${admin.user.id}, ${String(body.filename || "import.csv")}, ${toPostgresJson({ total: parsed.total, errors: parsed.errors.length })}::jsonb, ${toPostgresJson(valid)}::jsonb)`;
    return NextResponse.json({ ...parsed, valid });
  }
  if (body?.action === "commit" && Array.isArray(body.rows)) {
    const rows = body.rows.map((row: unknown) => campgroundInput.parse(row));
    const inserted = await sqlClient.begin(async (tx) => {
      let count = 0;
      for (const row of rows) {
        const result = await tx`
          INSERT INTO campgrounds (name, normalized_name, slug, address, city, region, country, postal_code, latitude, longitude, website, data_source)
          VALUES (${row.name}, ${normalizeName(row.name)}, ${row.slug}, ${row.address}, ${row.city}, ${row.region}, ${row.country}, ${row.postalCode}, ${row.latitude}, ${row.longitude}, ${row.website || null}, 'administrator-csv')
          ON CONFLICT (slug) DO NOTHING RETURNING id
        `;
        count += result.count;
      }
      await tx`INSERT INTO admin_audit_logs (actor_id, action, target_type, details) VALUES (${admin.user.id}, 'campground_csv_import', 'campground', ${toPostgresJson({ inserted: count, filename: body.filename })}::jsonb)`;
      return count;
    });
    return NextResponse.json({ inserted });
  }
  return NextResponse.json(
    { error: "Invalid import action." },
    { status: 400 },
  );
}
