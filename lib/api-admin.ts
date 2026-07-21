import { auth } from "./auth";
import { sqlClient } from "@/db";

export async function getApiAdmin(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user) return null;
  const rows = await sqlClient<
    { role: string; disabled_at: Date | null; banned: boolean }[]
  >`SELECT role, disabled_at, banned FROM "user" WHERE id = ${session.user.id}`;
  return rows[0]?.role === "admin" && !rows[0].disabled_at && !rows[0].banned
    ? session
    : null;
}
