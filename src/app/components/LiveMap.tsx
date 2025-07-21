"use client";

/**
 * Using React Leaflet, display a map which is updated live
 */

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Marker, useMap } from "react-leaflet";
import type L from "leaflet";          // leaflet types
import "leaflet/dist/leaflet.css";

// Latitude and logitude saved into props
type Props = { position: [number, number] };

// Recenter map any time position changes
function Recenter({ position }: { position: [number, number] }) {
    const map = useMap(); 
  
    useEffect(() => {
      map.setView(position);
    }, [position, map]);
  
    return null;
  }
  
// Import leaflet and render map
export default function LiveMap({ position }: Props) {
  const [leafletLoaded, setLeafletLoaded] = useState(false); // Set state to false until leaflet is imported

  useEffect(() => {
    (async () => {
      const Lmod = await import("leaflet");
      const L: typeof import("leaflet") = (await import("leaflet")).default;

      // Marker icons
      const iconUrl = (await import("leaflet/dist/images/marker-icon.png")).default;
      const iconRetina = (await import("leaflet/dist/images/marker-icon-2x.png")).default;
      const shadow = (await import("leaflet/dist/images/marker-shadow.png")).default;

      L.Icon.Default.mergeOptions({
        iconUrl: iconUrl.src,
        iconRetinaUrl: iconRetina.src,
        shadowUrl: shadow.src,
      });

      setLeafletLoaded(true); // Ready to proceed
    })();
  }, []);

  // Placeholder
  if (!leafletLoaded) return <div className="flex-1">Loading map…</div>;

  return (
  <MapContainer
    center={position}             // center on most recent position
    zoom={13}
    className="h-full w-full"     
    scrollWheelZoom
  >
    <Recenter position={position} />
    <TileLayer
      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" // Currently using OSM but could change if needed
      attribution="© OpenStreetMap contributors"
    />
    <Marker position={position} />
  </MapContainer>
);
}
