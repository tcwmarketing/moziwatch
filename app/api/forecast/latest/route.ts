import { NextResponse } from "next/server";
import { sqlClient } from "@/db";
import { parseDatabaseDate, type DatabaseDate } from "@/lib/database-date";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const runs = await sqlClient<
      {
        id: string;
        version: string;
        forecast_date: DatabaseDate;
        generated_at: DatabaseDate;
        is_synthetic: boolean;
        model_status: string;
        uses_user_reports: string;
      }[]
    >`
      SELECT r.id, m.version, r.forecast_date, r.generated_at, r.is_synthetic,
        coalesce(m.artifact->>'status', 'unknown') AS model_status,
        coalesce(m.artifact->>'usesUserReports', 'false') AS uses_user_reports
      FROM forecast_runs r JOIN forecast_models m ON m.id = r.model_id
      WHERE r.status = 'published'
        AND (${process.env.NODE_ENV === "production"} = false OR r.is_synthetic = false)
      ORDER BY r.forecast_date DESC, r.generated_at DESC LIMIT 1
    `;
    if (!runs[0]) {
      return NextResponse.json(
        {
          available: false,
          message: "The experimental forecast is not available yet.",
        },
        {
          headers: { "Cache-Control": "public, max-age=300" },
        },
      );
    }
    const cells = await sqlClient<
      { cell_key: string; longitude: number; latitude: number; score: number }[]
    >`
      SELECT cell_key, longitude, latitude, score FROM forecast_cells WHERE run_id = ${runs[0].id}::uuid
    `;
    return NextResponse.json(
      {
        available: true,
        kind: "experimental-weather-forecast",
        modelStatus: runs[0].model_status,
        trainedFromUserReports: runs[0].uses_user_reports === "true",
        modelVersion: runs[0].version,
        forecastDate: parseDatabaseDate(runs[0].forecast_date).toISOString(),
        generatedAt: parseDatabaseDate(runs[0].generated_at).toISOString(),
        demonstrationData: runs[0].is_synthetic,
        data: {
          type: "FeatureCollection",
          features: cells.map((cell) => ({
            type: "Feature",
            id: cell.cell_key,
            geometry: {
              type: "Point",
              coordinates: [cell.longitude, cell.latitude],
            },
            properties: { score: cell.score },
          })),
        },
      },
      {
        headers: {
          "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        },
      },
    );
  } catch (error) {
    console.error("Forecast API unavailable", error);
    return NextResponse.json(
      {
        available: false,
        message: "The experimental forecast is temporarily unavailable.",
      },
      { status: 503 },
    );
  }
}
