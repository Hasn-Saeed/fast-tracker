import { NextResponse } from "next/server";

type Stop = {
  name: string;
  lat: number;
  lon: number;
  stopOrder: number;
};

type RouteRequest = {
  bus: [number, number]; // [lat, lon]
  stops: Stop[];
  orderMode?: "planned" | "closest";
};

type OsrmResponse = {
  code: string;
  routes?: {
    distance: number; // meters
    duration: number; // seconds
    geometry: {
      coordinates: [number, number][]; // [lon, lat]
    };
  }[];
};

function distanceKm(a: [number, number], b: [number, number]): number {
  const earthRadiusKm = 6371;

  const lat1 = (a[0] * Math.PI) / 180;
  const lat2 = (b[0] * Math.PI) / 180;
  const dLat = ((b[0] - a[0]) * Math.PI) / 180;
  const dLon = ((b[1] - a[1]) * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));

  return earthRadiusKm * c;
}

function orderStopsByPlannedOrder(stops: Stop[]): Stop[] {
  return [...stops].sort((a, b) => a.stopOrder - b.stopOrder);
}

function orderStopsByClosestFirst(bus: [number, number], stops: Stop[]): Stop[] {
  const remaining = [...stops];
  const ordered: Stop[] = [];

  let currentPosition = bus;

  while (remaining.length > 0) {
    let bestIndex = 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let i = 0; i < remaining.length; i++) {
      const stop = remaining[i];
      const d = distanceKm(currentPosition, [stop.lat, stop.lon]);

      if (d < bestDistance) {
        bestDistance = d;
        bestIndex = i;
      }
    }

    const [nextStop] = remaining.splice(bestIndex, 1);
    ordered.push(nextStop);
    currentPosition = [nextStop.lat, nextStop.lon];
  }

  return ordered;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RouteRequest;

    const bus = body.bus;
    const stops = body.stops ?? [];
    const orderMode = body.orderMode ?? "planned";

    if (!bus || bus.length !== 2) {
      return NextResponse.json(
        { error: "Missing valid bus coordinates." },
        { status: 400 }
      );
    }

    if (stops.length === 0) {
      return NextResponse.json({
        orderedStops: [],
        routePoints: [],
        distanceKm: 0,
        etaMinutes: 0,
        provider: "osrm",
      });
    }

    const orderedStops =
      orderMode === "closest"
        ? orderStopsByClosestFirst(bus, stops)
        : orderStopsByPlannedOrder(stops);

    const coordinates: [number, number][] = [
      bus,
      ...orderedStops.map((stop) => [stop.lat, stop.lon] as [number, number]),
    ];

    // OSRM expects lon,lat — not lat,lon
    const coordinateString = coordinates
      .map(([lat, lon]) => `${lon},${lat}`)
      .join(";");

    const osrmUrl =
      `https://router.project-osrm.org/route/v1/driving/${coordinateString}` +
      `?overview=full&geometries=geojson&steps=false`;

    const osrmResponse = await fetch(osrmUrl, {
      cache: "no-store",
    });

    if (!osrmResponse.ok) {
      return NextResponse.json(
        { error: `OSRM request failed with HTTP ${osrmResponse.status}` },
        { status: 502 }
      );
    }

    const osrmJson = (await osrmResponse.json()) as OsrmResponse;

    if (osrmJson.code !== "Ok" || !osrmJson.routes?.[0]) {
      return NextResponse.json(
        { error: "OSRM could not build a route.", osrm: osrmJson },
        { status: 502 }
      );
    }

    const route = osrmJson.routes[0];

    // OSRM returns [lon, lat], Leaflet wants [lat, lon]
    const routePoints: [number, number][] = route.geometry.coordinates.map(
      ([lon, lat]) => [lat, lon]
    );

    return NextResponse.json({
      orderedStops,
      routePoints,
      distanceKm: route.distance / 1000,
      etaMinutes: Math.round(route.duration / 60),
      provider: "osrm",
      orderMode,
    });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to build route." },
      { status: 500 }
    );
  }
}