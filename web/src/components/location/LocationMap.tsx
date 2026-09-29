"use client";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { Circle, MapContainer, Marker, Popup, TileLayer, Tooltip, useMap } from "react-leaflet";
import { useEffect, useMemo } from "react";
import { PLACE_META, walkMin, type Place, type PlaceCat } from "@/components/location/placeMeta";

const pin = (cat: PlaceCat) => L.divIcon({
  className: "",
  iconSize: [26, 26], iconAnchor: [13, 13],
  html: `<span style="display:grid;place-items:center;width:26px;height:26px;border-radius:50%;background:${PLACE_META[cat].color};border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)"><svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${PLACE_META[cat].icon}"/></svg></span>`,
});
const home = L.divIcon({ className: "", iconSize: [34, 34], iconAnchor: [17, 34],
  html: `<svg viewBox="0 0 24 24" width="34" height="34"><path d="M12 22s-7-6.3-7-12a7 7 0 0 1 14 0c0 5.7-7 12-7 12z" fill="#0d5c4b" stroke="#fff" stroke-width="1.5"/><path d="M12 6.5l1.2 2.5 2.7.3-2 1.9.6 2.7-2.5-1.4-2.5 1.4.6-2.7-2-1.9 2.7-.3z" fill="#fff"/></svg>` });

function Fit({ lat, lng, radius }: { lat: number; lng: number; radius: number }) {
  const map = useMap();
  useEffect(() => {
    const d = (radius * 1.1) / 111320, e = d / Math.cos((lat * Math.PI) / 180);
    map.fitBounds([[lat - d, lng - e], [lat + d, lng + e]]);
  }, [map, lat, lng, radius]);
  return null;
}

export default function LocationMap({ lat, lng, places, show, radius = 800, focus }: { lat: number; lng: number; places: Place[]; show: Set<PlaceCat>; radius?: number; focus?: string | null }) {
  const icons = useMemo(() => Object.fromEntries(Object.keys(PLACE_META).map(c => [c, pin(c as PlaceCat)])) as Record<PlaceCat, L.DivIcon>, []);
  const visible = places.filter(p => show.has(p.cat) && p.meters <= radius * 1.25);
  return (
    <div className="h-[460px] w-full overflow-hidden rounded-xl border border-line">
      <MapContainer center={[lat, lng]} zoom={16} scrollWheelZoom={false} style={{ height: "100%", width: "100%" }}>
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <Fit lat={lat} lng={lng} radius={radius} />
        <Circle center={[lat, lng]} radius={400} pathOptions={{ color: "#0d5c4b", weight: 1.5, dashArray: "4 4", fillOpacity: 0.05 }}><Tooltip permanent direction="top" offset={[0, -8]} className="!bg-transparent !border-0 !shadow-none !text-[11px] !font-semibold">5 min walk</Tooltip></Circle>
        <Circle center={[lat, lng]} radius={800} pathOptions={{ color: "#0d5c4b", weight: 1.5, dashArray: "4 4", fillOpacity: 0.03 }} />
        {visible.map(p => (
          <Marker key={p.id} position={[p.lat, p.lng]} icon={icons[p.cat]} zIndexOffset={focus === p.id ? 1000 : 0}>
            <Popup><strong>{p.name}</strong><br />{p.kind}{p.detail ? ` · ${p.detail}` : ""}<br />{walkMin(p.meters)} min walk ({p.meters} m)</Popup>
          </Marker>
        ))}
        <Marker position={[lat, lng]} icon={home} zIndexOffset={2000}><Tooltip direction="top" offset={[0, -30]}>Your space</Tooltip></Marker>
      </MapContainer>
    </div>
  );
}
