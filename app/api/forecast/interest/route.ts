import { NextResponse } from "next/server";
import { z } from "zod";
import { recordForecastInterest } from "@/lib/forecast-interest";

const inputSchema = z.object({ campgroundId: z.uuid() });

export async function POST(request: Request) {
  try {
    const input = inputSchema.parse(await request.json());
    await recordForecastInterest(input.campgroundId);
    return NextResponse.json({ recorded: true });
  } catch (error) {
    if (error instanceof z.ZodError)
      return NextResponse.json(
        { error: "Invalid campground" },
        { status: 400 },
      );
    console.error("Unable to record forecast interest", error);
    return NextResponse.json(
      { error: "Forecast interest unavailable" },
      { status: 503 },
    );
  }
}
