"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { STUDENTS_BY_TAG, type Student } from "@/app/data/students";

const LiveMap = dynamic(() => import("@/app/components/LiveMap"), {
  ssr: false,
});

type Gps = {
  thing_name?: string;
  time?: string;
  formatted_timestamp?: string;
  timestamp?: number;

  latitude: number;
  longitude: number;

  current_speed?: number;
  speed?: number;
  satellites?: number;
  gps_valid?: boolean;

  rfids?: string[];
};

type Status = "online" | "offline";

type RouteMode = "planned" | "closest";

type RouteResponse = {
  orderedStops: {
    name: string;
    lat: number;
    lon: number;
    stopOrder: number;
  }[];
  routePoints: [number, number][];
  distanceKm: number;
  etaMinutes: number;
  provider: string;
  orderMode: RouteMode;
};

type ScanEvent = {
  id: string;
  tagId: string;
  studentName: string;
  action: "ON" | "OFF";
  time: string;
};

type ParentStatusMessage = {
  id: string;
  tagId: string;
  studentName: string;
  parentName: string;
  message: string;
  action: "BOARDED" | "DROPPED_OFF";
  time: string;
};

const DEVICES = ["GPS_Logger_2"];
const OFFLINE_MS = 5 * 60_000;
const POLL_MS = 15_000;

function normalizeTag(tag: string): string {
  return tag.trim().toUpperCase();
}

function getStudentFromTag(tag: string): Student | undefined {
  return STUDENTS_BY_TAG[normalizeTag(tag)];
}

function getStudentNameFromTag(tag: string): string {
  return getStudentFromTag(tag)?.name ?? normalizeTag(tag);
}

function createParentMessage(
  tag: string,
  action: "ON" | "OFF",
  time: string
): ParentStatusMessage {
  const normalizedTag = normalizeTag(tag);
  const student = getStudentFromTag(normalizedTag);

  const studentName = student?.name ?? normalizedTag;
  const parentName = student?.parentName ?? "Parent";

  const message =
    action === "ON"
      ? `${studentName} has boarded the bus.`
      : `${studentName} has been dropped off.`;

  return {
    id: `${Date.now()}-${normalizedTag}-${action}-parent`,
    tagId: normalizedTag,
    studentName,
    parentName,
    message,
    action: action === "ON" ? "BOARDED" : "DROPPED_OFF",
    time,
  };
}

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

export default function MapPage() {
  const [thing, setThing] = useState(DEVICES[0]);
  const [pos, setPos] = useState<[number, number]>([43.65, -79.38]);
  const [updated, setUpdated] = useState("");
  const [status, setStatus] = useState<Status>("offline");

  const [speed, setSpeed] = useState(0);
  const [satellites, setSatellites] = useState(0);
  const [gpsValid, setGpsValid] = useState(true);

  const [rfids, setRfids] = useState<string[]>([]);
  const [activeStudents, setActiveStudents] = useState<Student[]>([]);
  const [unknownTags, setUnknownTags] = useState<string[]>([]);

  const [routeMode, setRouteMode] = useState<RouteMode>("planned");
  const [routePoints, setRoutePoints] = useState<[number, number][]>([]);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeEtaMinutes, setRouteEtaMinutes] = useState<number | null>(null);
  const [routeProvider, setRouteProvider] = useState("");
  const [isRouting, setIsRouting] = useState(false);
  const [routeError, setRouteError] = useState("");

  const [trailPoints, setTrailPoints] = useState<[number, number][]>([]);

  const [scanEvents, setScanEvents] = useState<ScanEvent[]>([]);
  const [parentMessages, setParentMessages] = useState<ParentStatusMessage[]>(
    []
  );

  const previousRfidsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPos([coords.latitude, coords.longitude]);
    });
  }, []);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`/api/fetch?thing_name=${thing}`, {
          cache: "no-store",
        });

        if (r.status === 204) {
          setStatus("offline");
          setUpdated("");
          setRfids([]);
          setActiveStudents([]);
          setUnknownTags([]);
          setRoutePoints([]);
          setRouteDistanceKm(null);
          setRouteEtaMinutes(null);
          setRouteProvider("");
          setRouteError("");
          setTrailPoints([]);
          previousRfidsRef.current = [];
          return;
        }

        if (!r.ok) {
          throw new Error(`HTTP ${r.status}`);
        }

        const j: Gps = await r.json();

        const displayTime = j.formatted_timestamp ?? j.time ?? "";

        if (!displayTime) {
          setStatus("offline");
          return;
        }

        const rowMs = Date.parse(displayTime);

        if (Number.isNaN(rowMs) || Date.now() - rowMs > OFFLINE_MS) {
          setStatus("offline");
          setUpdated(displayTime);
          return;
        }

        const currentRfids = Array.from(
          new Set((j.rfids ?? []).map(normalizeTag))
        );

        const previousRfids = previousRfidsRef.current;

        const previousSet = new Set(previousRfids.map(normalizeTag));
        const currentSet = new Set(currentRfids.map(normalizeTag));

        const scannedOn = currentRfids.filter(
          (tag) => !previousSet.has(normalizeTag(tag))
        );

        const scannedOff = previousRfids.filter(
          (tag) => !currentSet.has(normalizeTag(tag))
        );

        const eventTime = new Date().toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
          second: "2-digit",
        });

        const newScanEvents: ScanEvent[] = [
          ...scannedOn.map((tag) => ({
            id: `${Date.now()}-${normalizeTag(tag)}-ON`,
            tagId: normalizeTag(tag),
            studentName: getStudentNameFromTag(tag),
            action: "ON" as const,
            time: eventTime,
          })),
          ...scannedOff.map((tag) => ({
            id: `${Date.now()}-${normalizeTag(tag)}-OFF`,
            tagId: normalizeTag(tag),
            studentName: getStudentNameFromTag(tag),
            action: "OFF" as const,
            time: eventTime,
          })),
        ];

        const newParentMessages: ParentStatusMessage[] = [
          ...scannedOn.map((tag) => createParentMessage(tag, "ON", eventTime)),
          ...scannedOff.map((tag) =>
            createParentMessage(tag, "OFF", eventTime)
          ),
        ];

        if (newScanEvents.length > 0) {
          setScanEvents((oldEvents) =>
            [...newScanEvents, ...oldEvents].slice(0, 10)
          );
        }

        if (newParentMessages.length > 0) {
          setParentMessages((oldMessages) =>
            [...newParentMessages, ...oldMessages].slice(0, 10)
          );
        }

        previousRfidsRef.current = currentRfids;

        const students = currentRfids
          .map((tag) => STUDENTS_BY_TAG[normalizeTag(tag)])
          .filter((student): student is Student => Boolean(student))
          .sort((a, b) => a.stopOrder - b.stopOrder);

        const unmappedTags = currentRfids.filter(
          (tag) => !STUDENTS_BY_TAG[normalizeTag(tag)]
        );

        const newPosition: [number, number] = [j.latitude, j.longitude];

        setPos(newPosition);
        setUpdated(displayTime);
        setStatus("online");

        setTrailPoints((oldTrail) => {
          const lastPoint = oldTrail[oldTrail.length - 1];

          // Avoid adding tiny GPS jitter. 0.01 km = about 10 meters.
          if (lastPoint && distanceKm(lastPoint, newPosition) < 0.01) {
            return oldTrail;
          }

          return [...oldTrail, newPosition].slice(-100);
        });

        setSpeed(j.current_speed ?? j.speed ?? 0);
        setSatellites(j.satellites ?? 0);
        setGpsValid(j.gps_valid ?? true);

        setRfids(currentRfids);
        setActiveStudents(students);
        setUnknownTags(unmappedTags);

        if (students.length === 0) {
          setRoutePoints([]);
          setRouteDistanceKm(null);
          setRouteEtaMinutes(null);
          setRouteProvider("");
          setRouteError("");
        }
      } catch (err) {
        console.error(err);
        setStatus("offline");
      }
    };

    poll();

    const id = setInterval(poll, POLL_MS);

    return () => clearInterval(id);
  }, [thing]);

  async function buildRoute() {
    if (activeStudents.length === 0) {
      setRoutePoints([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      setRouteProvider("");
      setRouteError("");
      return;
    }

    try {
      setIsRouting(true);
      setRouteError("");

      const stops = activeStudents.map((student) => ({
        name: student.name,
        lat: student.stopLat,
        lon: student.stopLon,
        stopOrder: student.stopOrder,
      }));

      const response = await fetch("/api/route", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          bus: pos,
          stops,
          orderMode: routeMode,
        }),
      });

      if (!response.ok) {
        throw new Error(`Route API failed with HTTP ${response.status}`);
      }

      const route = (await response.json()) as RouteResponse;

      setRoutePoints(route.routePoints);
      setRouteDistanceKm(route.distanceKm);
      setRouteEtaMinutes(route.etaMinutes);
      setRouteProvider(route.provider);
    } catch (error) {
      console.error(error);
      setRouteError("Could not build road-following route.");
      setRoutePoints([]);
      setRouteDistanceKm(null);
      setRouteEtaMinutes(null);
      setRouteProvider("");
    } finally {
      setIsRouting(false);
    }
  }

  function clearRoute() {
    setRoutePoints([]);
    setRouteDistanceKm(null);
    setRouteEtaMinutes(null);
    setRouteProvider("");
    setRouteError("");
  }

  function clearTrail() {
    setTrailPoints([]);
  }

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      <header className="flex items-center gap-4 bg-black px-4 py-2 text-sm text-white">
        <label>Device:</label>

        <select
          value={thing}
          onChange={(e) => setThing(e.target.value)}
          className="rounded border border-gray-600 bg-black px-2 py-1 text-white"
        >
          {DEVICES.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>

        <span
          className={
            status === "online"
              ? "rounded-full bg-green-600/80 px-2 py-0.5 text-xs font-medium"
              : "rounded-full bg-red-600/80 px-2 py-0.5 text-xs font-medium"
          }
        >
          {status}
        </span>

        <span className="ml-auto">Last update: {updated || "—"}</span>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[1fr_360px] lg:overflow-hidden">
        <section className="h-[55vh] min-h-[360px] overflow-hidden rounded-xl border bg-white shadow-sm lg:h-auto lg:min-h-0">
          <LiveMap
            position={pos}
            activeStudents={activeStudents}
            routePoints={routePoints}
            trailPoints={trailPoints}
          />
        </section>

        <aside className="rounded-xl border bg-white p-4 shadow-sm lg:overflow-y-auto">
          <h2 className="text-lg font-semibold">Bus Status</h2>

          <div className="mt-3 space-y-1 text-sm text-gray-700">
            <div>Speed: {speed.toFixed(1)} km/h</div>
            <div>Satellites: {satellites}</div>
            <div>GPS valid: {gpsValid ? "Yes" : "No"}</div>
            <div>Trail points: {trailPoints.length}</div>
          </div>

          <button
            onClick={clearTrail}
            disabled={trailPoints.length === 0}
            className="mt-3 w-full rounded-lg border px-4 py-2 text-sm font-medium disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
          >
            Clear Trail
          </button>

          <div className="mt-5 border-t pt-4">
            <h2 className="text-lg font-semibold">Students On Board</h2>

            {activeStudents.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                No students currently scanned on.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {activeStudents.map((student) => (
                  <div
                    key={student.tagId}
                    className="rounded-lg border p-3 text-sm"
                  >
                    <div className="font-semibold">{student.name}</div>
                    <div className="text-gray-600">{student.address}</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Stop #{student.stopOrder}
                    </div>

                    {student.parentName && (
                      <div className="mt-1 text-xs text-gray-500">
                        Parent: {student.parentName}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t pt-4">
            <h2 className="text-lg font-semibold">Next Drop-off</h2>

            {activeStudents[0] ? (
              <div className="mt-3 rounded-lg border p-3 text-sm">
                <div className="font-semibold">{activeStudents[0].name}</div>
                <div className="text-gray-600">{activeStudents[0].address}</div>
                <div className="mt-1 text-xs text-gray-500">
                  ETA: {routeEtaMinutes !== null ? `${routeEtaMinutes} min` : "pending"}
                </div>
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-500">No active drop-off.</p>
            )}
          </div>

          <div className="mt-5 border-t pt-4">
            <h2 className="text-lg font-semibold">Route</h2>

            <label className="mt-3 block text-sm font-medium text-gray-700">
              Route mode
            </label>

            <select
              value={routeMode}
              onChange={(e) => setRouteMode(e.target.value as RouteMode)}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="planned">Planned stop order</option>
              <option value="closest">Closest stop first</option>
            </select>

            <button
              onClick={buildRoute}
              disabled={activeStudents.length === 0 || isRouting}
              className="mt-3 w-full rounded-lg bg-black px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-400"
            >
              {isRouting ? "Building route..." : "Build Road Route"}
            </button>

            {routeError && (
              <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {routeError}
              </div>
            )}

            {routeDistanceKm !== null && (
              <div className="mt-3 rounded-lg border p-3 text-sm">
                <div>Stops: {activeStudents.length}</div>
                <div>Distance: {routeDistanceKm.toFixed(2)} km</div>
                <div>ETA: {routeEtaMinutes ?? "—"} min</div>
                <div>Provider: {routeProvider || "—"}</div>
                <div>
                  Mode:{" "}
                  {routeMode === "planned"
                    ? "Planned stop order"
                    : "Closest stop first"}
                </div>

                <div className="mt-1 text-xs text-gray-500">
                  Road-following route without traffic
                </div>

                <button
                  onClick={clearRoute}
                  className="mt-3 w-full rounded-lg border px-4 py-2 text-sm font-medium"
                >
                  Clear Route
                </button>
              </div>
            )}
          </div>

          <div className="mt-5 border-t pt-4">
            <h2 className="text-lg font-semibold">Parent Update Preview</h2>

            {parentMessages.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                No parent updates generated yet.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {parentMessages.map((update) => (
                  <div
                    key={update.id}
                    className="rounded-lg border bg-gray-50 p-3 text-sm"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        To: {update.parentName}
                      </span>

                      <span
                        className={
                          update.action === "BOARDED"
                            ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                            : "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                        }
                      >
                        {update.action === "BOARDED"
                          ? "Boarded"
                          : "Dropped off"}
                      </span>
                    </div>

                    <p className="mt-2 text-gray-700">{update.message}</p>

                    <div className="mt-2 text-xs text-gray-500">
                      {update.time} · {update.tagId}
                    </div>

                    <div className="mt-1 text-xs text-gray-400">
                      Preview only — not sent yet
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-5 border-t pt-4">
            <h2 className="text-lg font-semibold">Recent Scans</h2>

            {scanEvents.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">
                No recent scan events.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {scanEvents.map((event) => (
                  <div key={event.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold">
                        {event.studentName}
                      </span>

                      <span
                        className={
                          event.action === "ON"
                            ? "rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700"
                            : "rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700"
                        }
                      >
                        {event.action === "ON" ? "Scanned ON" : "Scanned OFF"}
                      </span>
                    </div>

                    <div className="mt-1 text-xs text-gray-500">
                      {event.time}
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      {event.tagId}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {unknownTags.length > 0 && (
            <div className="mt-5 rounded-lg border border-yellow-300 bg-yellow-50 p-3">
              <h2 className="font-semibold text-yellow-800">
                Unknown RFID Tags
              </h2>

              <div className="mt-2 space-y-1 text-sm text-yellow-900">
                {unknownTags.map((tag) => (
                  <div key={tag}>{tag}</div>
                ))}
              </div>

              <p className="mt-2 text-xs text-yellow-700">
                Add these tags to students.ts.
              </p>
            </div>
          )}

          <div className="mt-5 border-t pt-4">
            <h2 className="text-lg font-semibold">Raw RFID Data</h2>

            {rfids.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No raw tags.</p>
            ) : (
              <div className="mt-3 space-y-2">
                {rfids.map((tag) => (
                  <div key={tag} className="rounded-lg border p-2 text-sm">
                    {tag}
                  </div>
                ))}
              </div>
            )}
          </div>
        </aside>
      </main>
    </div>
  );
}