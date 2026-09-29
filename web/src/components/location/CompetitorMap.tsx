"use client";
import "leaflet/dist/leaflet.css";
import { Circle, CircleMarker, MapContainer, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect } from "react";
import type { Rival } from "@/components/location/Competitors";

function Fit({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    const dLat = (radius * 1.15) / 111320, dLng = dLat / Math.cos((lat * Math.PI) / 180);
    map.fitBounds([[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]]);
  }, [map, lat, lng, radius]);
  return null;
}

export default function CompetitorMap({ lat, lng, radius, items }: { lat: number; lng: number; radius: number; items: Rival[] }) {
  return (
    <div className="aspect-square w-full max-w-full overflow-hidden rounded-lg border border-line">
      <MapContainer center={[lat, lng]} zoom={15} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit lat={lat} lng={lng} radius={radius} />
        <Circle center={[lat, lng]} radius={radius} pathOptions={{ color: "#0d5c4b", weight: 1.5, fillOpacity: 0.06 }} />
        {items.map(c => (
          <CircleMarker key={c.id} center={[c.lat, c.lng]} radius={6} pathOptions={{ color: "#fff", weight: 2, fillOpacity: 1, fillColor: "#b83232" }}>
            <Tooltip>{c.name}</Tooltip>
          </CircleMarker>
        ))}
        <CircleMarker center={[lat, lng]} radius={10} pathOptions={{ color: "#fff", weight: 3, fillOpacity: 1, fillColor: "#0d5c4b" }}><Tooltip permanent direction="top">Your space</Tooltip></CircleMarker>
      </MapContainer>
    </div>
  );
}
