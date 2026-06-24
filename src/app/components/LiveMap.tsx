"use client";

import { useEffect, useState } from "react";
import {
  MapContainer,
  Marker,
  Popup,
  TileLayer,
  useMap,
  Polyline,
} from "react-leaflet";
import type { Student } from "@/app/data/students";
import "leaflet/dist/leaflet.css";

type Props = {
  position: [number, number];
  activeStudents: Student[];
  routePoints?: [number, number][];
  trailPoints?: [number, number][];
};

function Recenter({ position }: { position: [number, number] }) {
  const map = useMap();

  useEffect(() => {
    map.setView(position);
  }, [position, map]);

  return null;
}

export default function LiveMap({ position, activeStudents, routePoints = [], trailPoints = [],}: Props) {
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  useEffect(() => {
    async function loadLeaflet() {
      const L = await import("leaflet");

      const iconUrl = (await import("leaflet/dist/images/marker-icon.png"))
        .default;
      const iconRetinaUrl = (
        await import("leaflet/dist/images/marker-icon-2x.png")
      ).default;
      const shadowUrl = (await import("leaflet/dist/images/marker-shadow.png"))
        .default;

      L.Icon.Default.mergeOptions({
        iconUrl: iconUrl.src,
        iconRetinaUrl: iconRetinaUrl.src,
        shadowUrl: shadowUrl.src,
      });

      setLeafletLoaded(true);
    }

    loadLeaflet();
  }, []);

  if (!leafletLoaded) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-gray-100 text-sm text-gray-600">
        Loading map…
      </div>
    );
  }

  return (
    <MapContainer
      center={position}
      zoom={15}
      scrollWheelZoom={true}
      className="h-full w-full"
    >
      <Recenter position={position} />

      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="© OpenStreetMap contributors"
      />

      <Marker position={position}>
        <Popup>
          <div>
            <strong>Bus current location</strong>
            <br />
            Lat: {position[0].toFixed(5)}
            <br />
            Lon: {position[1].toFixed(5)}
          </div>
        </Popup>
      </Marker>

      {activeStudents.map((student) => (
        <Marker
          key={student.tagId}
          position={[student.stopLat, student.stopLon]}
        >
          <Popup>
            <div>
              <strong>{student.name}</strong>
              <br />
              {student.address}
              <br />
              Stop #{student.stopOrder}
              {student.parentName && (
                <>
                  <br />
                  Parent: {student.parentName}
                </>
              )}
            </div>
          </Popup>
        </Marker>
      ))}
      {routePoints.length > 1 && (
        <Polyline positions={routePoints} />
      )}
      {trailPoints.length > 1 && <Polyline positions={trailPoints} />}
      {routePoints.length > 1 && <Polyline positions={routePoints} />}
    </MapContainer>
  );
}