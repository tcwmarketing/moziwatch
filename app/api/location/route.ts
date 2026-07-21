import { NextResponse } from "next/server";

function coordinate(value: string | null, minimum: number, maximum: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : null;
}

export async function GET(request: Request) {
  const headers = request.headers;
  const latitude = coordinate(
    headers.get("x-vercel-ip-latitude") || headers.get("cf-iplatitude"),
    -90,
    90,
  );
  const longitude = coordinate(
    headers.get("x-vercel-ip-longitude") || headers.get("cf-iplongitude"),
    -180,
    180,
  );
  if (
    latitude === null ||
    longitude === null ||
    (Math.abs(latitude) <= 0.01 && Math.abs(longitude) <= 0.01)
  )
    return NextResponse.json({ available: false }, { status: 404 });

  return NextResponse.json(
    { available: true, latitude, longitude },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
