import { NextResponse } from "next/server";
import { sqlClient } from "@/db";

export async function GET() {
  try {
    await sqlClient`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "ok",
      checkedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      {
        status: "degraded",
        database: "unavailable",
        checkedAt: new Date().toISOString(),
      },
      { status: 503 },
    );
  }
}
