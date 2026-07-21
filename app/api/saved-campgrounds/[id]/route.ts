import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { sqlClient } from "@/db";
import { isSameOrigin } from "@/lib/privacy";

const identifier = z.string().uuid();

async function context(request: Request, params: Promise<{ id: string }>) {
  if (!isSameOrigin(request))
    return { error: "Invalid request origin.", status: 403 } as const;
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user)
    return { error: "Sign in required.", status: 401 } as const;
  const parsed = identifier.safeParse((await params).id);
  if (!parsed.success)
    return { error: "Invalid campground.", status: 400 } as const;
  return { userId: session.user.id, campgroundId: parsed.data } as const;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await context(request, params);
  if ("error" in result)
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  const rows = await sqlClient<{ saved: boolean }[]>`
    INSERT INTO saved_campgrounds (account_id, campground_id)
    SELECT ${result.userId}, id FROM campgrounds WHERE id = ${result.campgroundId}::uuid AND active = true
    ON CONFLICT DO NOTHING
    RETURNING true AS saved
  `;
  if (!rows.length) {
    const existing = await sqlClient<{ saved: boolean }[]>`
      SELECT EXISTS(
        SELECT 1 FROM saved_campgrounds
        WHERE account_id = ${result.userId}
          AND campground_id = ${result.campgroundId}::uuid
      ) AS saved
    `;
    if (!existing[0]?.saved)
      return NextResponse.json(
        { error: "Campground not found." },
        { status: 404 },
      );
  }
  return NextResponse.json(
    { saved: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const result = await context(request, params);
  if ("error" in result)
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  await sqlClient`
    DELETE FROM saved_campgrounds
    WHERE account_id = ${result.userId} AND campground_id = ${result.campgroundId}::uuid
  `;
  return NextResponse.json(
    { saved: false },
    { headers: { "Cache-Control": "no-store" } },
  );
}
