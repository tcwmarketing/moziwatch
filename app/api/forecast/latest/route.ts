import { NextResponse } from "next/server";
import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await sqlClient<
      Array<{
        id: string;
        version: string;
        generated_at: DatabaseDate;
        campground_count: number;
        profile_kind: string;
        model_kind: string;
      }>
    >`
      SELECT r.id, m.version, m.model_kind, r.generated_at,
             count(DISTINCT cf.campground_id)::int AS campground_count,
             min(pv.data_kind) AS profile_kind
      FROM forecast_runs r
      JOIN forecast_models m ON m.id = r.model_id
      JOIN campground_forecasts cf ON cf.run_id = r.id
      JOIN campground_habitat_profiles hp ON hp.id = cf.habitat_profile_id
      JOIN habitat_profile_versions pv ON pv.id = hp.profile_version_id
      WHERE r.status = 'published' AND r.is_production = true
        AND m.model_kind IN ('campground-habitat-weather-beta', 'campground-weather-habitat-report-index')
      GROUP BY r.id, m.version, m.model_kind, r.generated_at
      ORDER BY r.generated_at DESC LIMIT 1
    `;
    if (!runs[0])
      return NextResponse.json({
        available: false,
        message: "Campground outlooks have not been published yet.",
      });
    return NextResponse.json({
      available: true,
      kind: "campground-outlook",
      modelStatus:
        runs[0].model_kind === "campground-weather-habitat-report-index"
          ? "experimental"
          : "beta",
      modelVersion: runs[0].version,
      generatedAt: parseDatabaseDate(runs[0].generated_at).toISOString(),
      campgroundCount: runs[0].campground_count,
      profileKind: runs[0].profile_kind,
      usesUserReports:
        runs[0].model_kind === "campground-weather-habitat-report-index",
      message:
        "Modeled campground outlooks are separate from actual camper-report ratings.",
    });
  } catch (error) {
    console.error("Campground forecast metadata unavailable", error);
    return NextResponse.json(
      {
        available: false,
        message: "Campground outlooks are temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
