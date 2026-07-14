import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { sqlClient } from "@/db";
import { isSameOrigin } from "@/lib/privacy";

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
