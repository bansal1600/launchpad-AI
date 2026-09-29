import { competitorPlaces, placesNear } from "@/lib/services/places";
import { MILE } from "@/lib/engine/geo";
import { BusinessType } from "@/lib/schemas";

// Real nearby businesses of the same type from OpenStreetMap. Health inspection scores join in once County data is imported.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lng = Number(q.get("lng")), radius = Number(q.get("radius") ?? 800);
  const type = BusinessType.safeParse(q.get("type"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !type.success) return Response.json({ error: "lat, lng and type are required" }, { status: 400 });
  try {
    const all = competitorPlaces(await placesNear(lat, lng), type.data);
    const items = all.filter(p => p.meters <= radius);
    const miles = radius / MILE;
    const perSqMile = Math.round((items.length / (Math.PI * miles * miles)) * 10) / 10;
    return Response.json({
      radiusMeters: radius, count: items.length, perSqMile,
      saturation: perSqMile >= 14 ? "high" : perSqMile >= 7 ? "medium" : "low",
      items: items.map(p => ({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, distanceMeters: p.meters, kind: p.kind, detail: p.detail })),
      source: "© OpenStreetMap contributors",
    });
  } catch (e) {
    return Response.json({ error: `Couldn't load nearby businesses right now (${(e as Error).message}).` }, { status: 502 });
  }
}
