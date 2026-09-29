import "server-only";
// Real places around an address from OpenStreetMap (Overpass API; free, no key).
import { haversine } from "@/lib/engine/geo";
import type { BusinessType } from "@/lib/schemas";

export const PLACE_CATS = ["bus", "rail", "parking", "bike", "food", "shops", "offices", "community"] as const;
export type PlaceCat = (typeof PLACE_CATS)[number];
export type Place = { id: string; cat: PlaceCat; kind: string; name: string; lat: number; lng: number; meters: number; detail?: string };

type OsmEl = { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> };

const RETAIL_SHOPS = /^(clothes|boutique|gift|shoes|jewelry|fashion_accessories|bag|cosmetics|second_hand|variety_store)$/;

function classify(t: Record<string, string>): { cat: PlaceCat; kind: string } | null {
  if (t.highway === "bus_stop" || (t.public_transport === "platform" && t.bus === "yes")) return { cat: "bus", kind: "Bus stop" };
  if (/^(station|halt|tram_stop)$/.test(t.railway ?? "") || t.public_transport === "station") return { cat: "rail", kind: t.railway === "tram_stop" || t.light_rail === "yes" ? "Light rail stop" : "Train station" };
  if (t.amenity === "parking") return { cat: "parking", kind: t.parking === "multi-storey" || t.parking === "underground" ? "Parking garage" : "Parking lot" };
  if (t.amenity === "bicycle_rental") return { cat: "bike", kind: "Bike share" };
  if (/^(cafe|restaurant|fast_food|bar|pub|ice_cream)$/.test(t.amenity ?? "")) return { cat: "food", kind: t.amenity === "cafe" ? "Café" : t.amenity === "fast_food" ? "Quick service" : t.amenity === "bar" || t.amenity === "pub" ? "Bar" : "Restaurant" };
  if (t.shop) return { cat: "shops", kind: t.shop === "supermarket" ? "Grocery" : RETAIL_SHOPS.test(t.shop) ? "Boutique / retail" : "Shop" };
  if (t.office) return { cat: "offices", kind: "Office" };
  if (/^(school|college|university|library|theatre|cinema|arts_centre|community_centre)$/.test(t.amenity ?? "") || t.leisure === "park" || t.tourism === "museum" || t.tourism === "hotel")
    return { cat: "community", kind: t.leisure === "park" ? "Park" : t.tourism === "hotel" ? "Hotel" : t.tourism === "museum" ? "Museum" : t.amenity === "university" || t.amenity === "college" ? "College" : t.amenity === "school" ? "School" : t.amenity === "library" ? "Library" : "Venue" };
  return null;
}

const cache = new Map<string, { at: number; places: Place[] }>();
const inflight = new Map<string, Promise<Place[]>>();

/** Overpass is a shared public server: retry once on overload (429/504). */
async function overpass(q: string): Promise<OsmEl[]> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://overpass-api.de/api/interpreter", {
      method: "POST", body: new URLSearchParams({ data: q }),
      headers: { "user-agent": "ComplyCofounder/0.1 (small business planning prototype)" }, signal: AbortSignal.timeout(35000),
    });
    if (res.ok) return ((await res.json()) as { elements: OsmEl[] }).elements;
    if (attempt >= 2 || ![429, 502, 503, 504].includes(res.status)) throw new Error(`OpenStreetMap returned ${res.status}`);
    await new Promise(r => setTimeout(r, 1500 * (attempt + 1)));
  }
}

/** One cached, shared request per location (neighborhood and competitors both read it). */
export function placesNear(lat: number, lng: number): Promise<Place[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (!inflight.has(key)) inflight.set(key, placesAround(lat, lng, 1700).finally(() => setTimeout(() => inflight.delete(key), 1000)));
  return inflight.get(key)!;
}

export async function placesAround(lat: number, lng: number, radius = 1000): Promise<Place[]> {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)},${radius}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 6 * 3600e3) return hit.places;
  const a = `(around:${radius},${lat},${lng})`;
  const q = `[out:json][timeout:25];(
    node${a}["highway"="bus_stop"];
    nwr${a}["railway"~"^(station|halt|tram_stop)$"];
    nwr${a}["amenity"~"^(parking|bicycle_rental|cafe|restaurant|fast_food|bar|pub|ice_cream|school|college|university|library|theatre|cinema|arts_centre|community_centre)$"];
    nwr${a}["shop"];
    nwr${a}["office"];
    nwr${a}["leisure"="park"];
    nwr${a}["tourism"~"^(museum|hotel)$"];
  );out center tags 3000;`;
  const elements = await overpass(q);
  const places: Place[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const t = e.tags ?? {};
    const c = classify(t);
    const la = e.lat ?? e.center?.lat, lo = e.lon ?? e.center?.lon;
    if (!c || la == null || lo == null) continue;
    const name = t.name ?? (c.cat === "bus" ? "Bus stop" : c.kind);
    // Bus stops come as one node per direction; keep one per name.
    const dedupe = c.cat === "bus" || c.cat === "rail" ? `${c.cat}:${name}` : `${e.type}${e.id}`;
    if (seen.has(dedupe)) continue;
    seen.add(dedupe);
    const detail = c.cat === "parking" ? [t.access === "private" ? "Private" : t.fee === "no" ? "Free" : t.fee === "yes" ? "Paid" : "", t.capacity ? `${t.capacity} spaces` : ""].filter(Boolean).join(" · ")
      : c.cat === "bus" ? (t.route_ref ? `Routes ${t.route_ref}` : "") : t.cuisine?.replace(/_/g, " ").replace(/;/g, ", ") ?? "";
    places.push({ id: `${e.type}${e.id}`, cat: c.cat, kind: c.kind, name, lat: la, lng: lo, meters: Math.round(haversine(lat, lng, la, lo)), detail: detail || undefined });
  }
  places.sort((x, y) => x.meters - y.meters);
  cache.set(key, { at: Date.now(), places });
  return places;
}

/** Direct competitors: the same kind of business, from the same OpenStreetMap places. */
export function competitorPlaces(places: Place[], type: BusinessType): Place[] {
  if (type === "cafe") return places.filter(p => p.kind === "Café");
  if (type === "restaurant") return places.filter(p => p.cat === "food" && p.kind !== "Café" && p.kind !== "Bar");
  return places.filter(p => p.kind === "Boutique / retail");
}
