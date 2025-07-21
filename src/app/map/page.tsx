"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

const LiveMap = dynamic(() => import("@/app/components/LiveMap"), { ssr: false });

// GPS data returned includes latitude, longitude, and human readable timestamp (currently using EST)
type Gps    = { latitude: number; longitude: number; formatted_timestamp: string };
type Status = "online" | "offline"; // Possible device status

const DEVICES     = ["GPS_Logger_2"];    // Additional loggers will be added as they're created
const OFFLINE_MS  = 5 * 60_000;          // 5-minute timeout
const POLL_MS     = 15_000;              // poll Lambda every 15 seconds (just for testing, will be changed to every minute)
const LIVENESS_MS = 60_000;              // check offline timer every minute

export default function MapPage() {
  const [thing, setThing]   = useState(DEVICES[0]); // Currently selected device
  const [pos,   setPos]     = useState<[number, number]>([43.65, -79.38]); // Default position if no GPS data available
  const [updated, setUpdated] = useState(""); // Most recent data (time received)
  const [status,  setStatus]  = useState<Status>("offline"); // Initially set to offline
  const [lastSeen, setLastSeen] = useState<number>(0);       // Time of last valid data row

  // Center around browser location on launch
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(({ coords }) =>
        setPos([coords.latitude, coords.longitude]),
      );
    }
  }, []);

  // Poll lambda to fetch location and time data
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`/api/fetch?thing_name=${thing}`, { cache: "no-store" });

        // If no data received (204), device is offline
        if (r.status === 204) {
          setStatus("offline");
          setUpdated("");
          return;
        }

        if (!r.ok) throw new Error(`HTTP ${r.status}`);

        const j: Gps = await r.json();

        // Convert row timestamp to epoch (in ms)
        const rowMs = Date.parse(j.formatted_timestamp);

        // Check how long ago the data was sent. If longer than 5 minutes then device set to offline
        if (Date.now() - rowMs > OFFLINE_MS) {
          setStatus("offline");
          setUpdated(j.formatted_timestamp);
          return;
        }

      // If device is online, set position to last received coordinates and show time as well
      setPos([j.latitude, j.longitude]);
      setUpdated(j.formatted_timestamp);
      setStatus("online");
    } catch (err) {
      console.error(err);
      setStatus("offline");
    }
  };

  poll();
  const id = setInterval(poll, POLL_MS);
  return () => clearInterval(id);
}, [thing]);

  /* ─────────── UI ─────────── */
  return (
    <div className="flex flex-col h-screen">
      <header className="bg-black text-white px-4 py-2 flex items-center gap-4 text-sm">
        <label>Device:</label>

        <select
          value={thing}
          onChange={(e) => setThing(e.target.value)}
          className="bg-black text-white border border-gray-600 rounded px-2 py-1"
        >
          {DEVICES.map((d) => (
            <option key={d}>{d}</option>
          ))}
        </select>

        {/* Status pill */}
        <span
          className={
            status === "online"
              ? "rounded-full bg-green-600/80 px-2 py-0.5 text-xs font-medium"
              : "rounded-full bg-red-600/80   px-2 py-0.5 text-xs font-medium"
          }
        >
          {status}
        </span>

        <span className="ml-auto">
          Last&nbsp;update:&nbsp;{updated || "—"}
        </span>
      </header>

      <LiveMap position={pos} />
    </div>
  );
}
