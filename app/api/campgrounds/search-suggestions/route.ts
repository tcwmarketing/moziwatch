import { NextResponse } from "next/server";
import { sqlClient } from "@/db";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80);
  if (!query || query.length < 2) return NextResponse.json({ suggestions: [] });

  const rows = await sqlClient<
    Array<{
      id: string;
      name: string;
      slug: string;
      city: string;
      region: string;
      country: string;
    }>
  >`
    SELECT id, name, slug, city, region, country
    FROM campgrounds
    WHERE active = true
      AND operational_status <> 'closed'
      AND verification_status <> 'unverified'
      AND (name || ' ' || city || ' ' || region) ILIKE ${`%${query}%`}
    ORDER BY
      CASE WHEN name ILIKE ${`${query}%`} THEN 0 ELSE 1 END,
      extensions.similarity(name || ' ' || city || ' ' || region, ${query}) DESC,
      name
    LIMIT 8
  `;

  return NextResponse.json({
    suggestions: rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      location: [row.city, row.region, row.country]
        .filter((part) => part && part !== "Unknown")
        .join(", "),
    })),
  });
}
