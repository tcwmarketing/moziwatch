import { NextResponse } from "next/server";
import { getCampgroundMapDetail, type RatingPeriod } from "@/lib/campgrounds";

export const dynamic = "force-dynamic";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id))
    return NextResponse.json(
      { error: "A valid campground ID is required." },
      { status: 400 },
    );
  const requested = new URL(request.url).searchParams.get("period");
  const period: RatingPeriod =
    requested === "historical" ? "historical" : "recent";
  try {
    const campground = await getCampgroundMapDetail(id, period);
    if (!campground)
      return NextResponse.json(
        { error: "Campground not found." },
        { status: 404 },
      );
    return NextResponse.json(campground, {
      headers: {
        "Cache-Control":
          "public, max-age=30, s-maxage=60, stale-while-revalidate=300",
      },
    });
  } catch (error) {
    console.error("Campground map detail unavailable", error);
    return NextResponse.json(
      { error: "Campground details are temporarily unavailable." },
      { status: 503 },
    );
  }
}
