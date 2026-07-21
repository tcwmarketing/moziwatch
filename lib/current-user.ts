import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { sqlClient } from "@/db";

export async function requireUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/sign-in");
  const status = await sqlClient<
    { disabled_at: Date | null; banned: boolean }[]
  >`SELECT disabled_at, banned FROM "user" WHERE id = ${session.user.id} LIMIT 1`;
  if (!status[0] || status[0].disabled_at || status[0].banned)
    redirect("/sign-in");
  return session;
}

export async function requireAdmin() {
  const session = await requireUser();
  const rows = await sqlClient<
    { role: "member" | "admin"; disabled_at: Date | null; banned: boolean }[]
  >`
    SELECT role, disabled_at, banned FROM "user" WHERE id = ${session.user.id} LIMIT 1
  `;
  if (rows[0]?.role !== "admin" || rows[0].disabled_at || rows[0].banned)
    redirect("/");
  return session;
}
