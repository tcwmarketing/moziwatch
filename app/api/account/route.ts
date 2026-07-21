import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sqlClient } from "@/db";
import { isSameOrigin } from "@/lib/privacy";
import { z } from "zod";

const profileSchema = z.object({
  name: z.string().trim().min(1).max(80),
  homeCity: z
    .object({
      id: z.string().trim().min(1).max(120),
      city: z.string().trim().min(1).max(100),
      region: z.string().trim().max(120),
      country: z.enum(["CA", "US"]),
      label: z.string().trim().min(1).max(120),
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
    })
    .nullable(),
});

export async function PATCH(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const parsed = profileSchema.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success)
    return NextResponse.json(
      { error: "Enter a name and a valid home city." },
      { status: 400 },
    );
  const [updated] = await sqlClient<
    {
      name: string;
      home_city: string | null;
      home_city_region: string | null;
      home_city_country: string | null;
      home_city_latitude: number | null;
      home_city_longitude: number | null;
      home_city_place_id: string | null;
    }[]
  >`
    UPDATE "user"
    SET name = ${parsed.data.name},
        home_city = ${parsed.data.homeCity?.label || null},
        home_city_region = ${parsed.data.homeCity?.region || null},
        home_city_country = ${parsed.data.homeCity?.country || null},
        home_city_latitude = ${parsed.data.homeCity?.latitude ?? null},
        home_city_longitude = ${parsed.data.homeCity?.longitude ?? null},
        home_city_place_id = ${parsed.data.homeCity?.id || null},
        updated_at = now()
    WHERE id = ${session.user.id}
    RETURNING name, home_city, home_city_region, home_city_country,
      home_city_latitude, home_city_longitude, home_city_place_id
  `;
  if (!updated)
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  return NextResponse.json({
    name: updated.name,
    homeCity: updated.home_city || "",
  });
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request))
    return NextResponse.json(
      { error: "Invalid request origin." },
      { status: 403 },
    );
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  await sqlClient.begin(async (tx) => {
    await tx`UPDATE reports SET account_id = NULL, updated_at = now() WHERE account_id = ${session.user.id}`;
    await tx`DELETE FROM "user" WHERE id = ${session.user.id}`;
  });
  return NextResponse.json({ ok: true });
}
