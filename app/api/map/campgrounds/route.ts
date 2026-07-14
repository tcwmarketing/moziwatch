import { NextResponse } from "next/server";
import { listCampgrounds, type RatingPeriod } from "@/lib/campgrounds";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("period");
  const period: RatingPeriod =
    requested === "historical" ? "historical" : "recent";
  try {
    const features = await listCampgrounds(period);
    return NextResponse.json(
      { type: "FeatureCollection", features },
      {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        },
      },
    );
  } catch (error) {
    console.error("Campground map data unavailable", error);
    return NextResponse.json(
      { error: "Campground data is temporarily unavailable." },
      { status: 503 },
    );
  }
}
