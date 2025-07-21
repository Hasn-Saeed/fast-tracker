import { NextResponse } from "next/server";

// API endpoint is: GET /api/fetch?thing_name=GPS_Logger_2
export async function GET(req: Request) {
  const url   = new URL(req.url);
  const thing = url.searchParams.get("thing_name") ?? "GPS_Logger_2"; // Extract device name

  // Define FETCH_GPS_URL environment
  const base = process.env.FETCH_GPS_URL;
  if (!base) {
    return NextResponse.json(
      { error: "FETCH_GPS_URL environment variable not set" },
      { status: 500 },
    );
  }

  // Reqyest to lambda
  const upstream = `${base}?thing_name=${encodeURIComponent(thing)}`;

  try {
    const res  = await fetch(upstream, { cache: "no-store" }); // Current data

    // If no data received, device will be displayed as offline
    if (res.status === 404) {
      return new NextResponse(null, { status: 204 });
    }

    // Any other possible bad responses
    if (!res.ok) {
      return new NextResponse(null, { status: res.status });
    }

    // Forward JSON from lambda
    const json = await res.text();
    return new NextResponse(json, {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: any) { // In case of failure, display error message (code is 500)
    return NextResponse.json(
      { error: err.message ?? "upstream fetch failed" },
      { status: 500 },
    );
  }
}
