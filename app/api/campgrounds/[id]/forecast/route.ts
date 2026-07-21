import { NextResponse } from "next/server";
import { getCampgroundOutlook } from "@/lib/campground-forecast";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id,
    )
  )
    return NextResponse.json({ error: "Invalid campground." }, { status: 400 });
  try {
    const outlook = await getCampgroundOutlook(id);
    if (!outlook)
      return NextResponse.json(
        { available: false, message: "No production forecast is available." },
        { status: 404 },
      );
    return NextResponse.json(outlook, {
      headers: {
        "Cache-Control":
          "public, max-age=300, s-maxage=900, stale-while-revalidate=1800",
      },
    });
  } catch (error) {
    console.error("Campground forecast unavailable", {
      campgroundId: id,
      error,
    });
    return NextResponse.json(
      { error: "The campground forecast is temporarily unavailable." },
      { status: 503 },
    );
  }
}
