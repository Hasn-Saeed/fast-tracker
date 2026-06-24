"use client";

import { useEffect, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

type HistoryEntry = {
  timestamp?: string | number;
  formatted_timestamp?: string;
  current_speed?: number;
  speed?: number;
};

type Point = { timestamp: string; speed: number };
const DEVICE_LIST = ["GPS_Logger_1", "GPS_Logger_2 (First Prototype)", /* Additional loggers can be added here as they're created */];

export default function HistoryPage() {
  const [thing, setThing] = useState(DEVICE_LIST[0]);
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
  async function load() {
    const res = await fetch(`/api/fetch?thing_name=${thing}`);

    if (!res.ok) {
      console.error(`Failed to fetch history data: HTTP ${res.status}`);
      return;
    }

    const json = (await res.json()) as HistoryEntry | HistoryEntry[];

    const items: HistoryEntry[] = Array.isArray(json) ? json : [json];

    setData(
      items.map((entry) => {
        const rawTimestamp = entry.formatted_timestamp ?? entry.timestamp ?? "";

        return {
          timestamp: rawTimestamp
            ? new Date(rawTimestamp).toLocaleTimeString()
            : "—",
          speed: entry.current_speed ?? entry.speed ?? 0,
        };
      })
    );
  }

  load();
}, [thing]);

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center space-x-4">
        <label>Select device:</label>
        <select
          value={thing}
          onChange={(e) => setThing(e.target.value)}
          className="border px-2 py-1"
        >
          {DEVICE_LIST.map((d) => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
      </div>

      <h1 className="text-xl mb-4">Trip History for {thing}</h1>
      <LineChart width={600} height={300} data={data}>
        <XAxis dataKey="timestamp" />
        <YAxis />
        <Tooltip />
        <CartesianGrid stroke="#eee" />
        <Line type="monotone" dataKey="speed" stroke="#8884d8" />
      </LineChart>
    </div>
  );
}
