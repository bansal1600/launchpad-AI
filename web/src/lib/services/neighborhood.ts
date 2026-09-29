import "server-only";
import { PLACE_CATS, placesNear, type Place, type PlaceCat } from "@/lib/services/places";

// Census figures come from Census Reporter (ACS 5-year, free, no key). Places come from OpenStreetMap.
export type Census = {
  release: string; residents: number; households: number; medianIncome: number; countyMedianIncome: number;
  medianAge: number; countyMedianAge: number; renterPct: number; transitWalkPct: number; countyTransitWalkPct: number;
};
export type Neighborhood = {
  census: Census | null;
  places: Place[];
  within10: Record<PlaceCat, number>;
  activity: { weekday: number[]; weekend: number[] };
  sources: string[];
};

type CR = { release: { name: string }; data: Record<string, Record<string, { estimate: Record<string, number> }>> };

const censusCache = new Map<string, Census>();

export async function censusFor(tractGeoid: string): Promise<Census | null> {
  if (!/^\d{11}$/.test(tractGeoid)) return null;
  const tract = `14000US${tractGeoid}`, county = `05000US${tractGeoid.slice(0, 5)}`;
  const url = `https://api.censusreporter.org/1.0/data/show/latest?table_ids=B01003,B11001,B19013,B01002,B25003,B08301&geo_ids=${tract},${county}`;
  const hit = censusCache.get(tractGeoid);
  if (hit) return hit;
  const res = await fetch(url, { signal: AbortSignal.timeout(40000), headers: { "user-agent": "Mozilla/5.0 (compatible; ComplyCofounder/0.1)", accept: "application/json" } });
  if (!res.ok) return null;
  const d = (await res.json()) as CR;
  const t = d.data[tract], c = d.data[county];
  if (!t || !c) return null;
  const pct = (x: number, total: number) => (total ? Math.round((x / total) * 1000) / 10 : 0);
  const tw = (g: typeof t) => pct(g.B08301.estimate.B08301010 + g.B08301.estimate.B08301019, g.B08301.estimate.B08301001);
  const out: Census = {
    release: d.release.name,
    residents: t.B01003.estimate.B01003001, households: t.B11001.estimate.B11001001,
    medianIncome: t.B19013.estimate.B19013001, countyMedianIncome: c.B19013.estimate.B19013001,
    medianAge: t.B01002.estimate.B01002001, countyMedianAge: c.B01002.estimate.B01002001,
    renterPct: pct(t.B25003.estimate.B25003003, t.B25003.estimate.B25003001),
    transitWalkPct: tw(t), countyTransitWalkPct: tw(c),
  };
  censusCache.set(tractGeoid, out);
  return out;
}

/**
 * Relative activity by hour (0–100), modeled from what's within a 5-minute walk:
 * offices and schools drive weekday commute and lunch, food and shops drive midday and evening,
 * transit adds commute peaks. It's an estimate, not a measured count.
 */
export function modelActivity(places: Place[]) {
  const near = (c: PlaceCat) => places.filter(p => p.cat === c && p.meters <= 400).length;
  const w = { offices: near("offices") + near("community") * 0.5, food: near("food"), shops: near("shops"), transit: near("bus") + near("rail") * 4 };
  const g = (h: number, mu: number, s: number) => Math.exp(-((h - mu) ** 2) / (2 * s * s));
  const curve = (weekend: boolean) => Array.from({ length: 24 }, (_, h) => {
    if (h < 6) return 0.02;
    return weekend
      ? w.food * (g(h, 12.5, 2.2) + 0.9 * g(h, 19, 1.8)) + w.shops * g(h, 14, 3) + w.transit * 0.3 * g(h, 14, 4) + w.offices * 0.1 * g(h, 12, 3)
      : w.offices * (0.8 * g(h, 8.5, 1.1) + g(h, 12.3, 1.2) + 0.7 * g(h, 17.5, 1.3)) + w.food * (g(h, 12.5, 1.5) + 0.8 * g(h, 19, 1.6)) + w.shops * 0.7 * g(h, 15, 3) + w.transit * (g(h, 8, 1.2) + g(h, 17.5, 1.3));
  });
  const wd = curve(false), we = curve(true);
  const max = Math.max(...wd, ...we, 1e-6);
  const scale = (xs: number[]) => xs.map(x => Math.round((x / max) * 100));
  return { weekday: scale(wd), weekend: scale(we) };
}

export async function neighborhood(lat: number, lng: number, tract?: string): Promise<Neighborhood> {
  const [places, census] = await Promise.all([
    placesNear(lat, lng).then(ps => ps.filter(p => p.meters <= 1000)).catch(() => [] as Place[]),
    tract ? censusFor(tract).catch(() => null) : Promise.resolve(null),
  ]);
  const within10 = Object.fromEntries(PLACE_CATS.map(c => [c, places.filter(p => p.cat === c && p.meters <= 800).length])) as Record<PlaceCat, number>;
  const sources = [
    ...(census ? [`US Census Bureau, ${census.release} (via Census Reporter)`] : []),
    ...(places.length ? ["© OpenStreetMap contributors"] : []),
  ];
  return { census, places, within10, activity: modelActivity(places), sources };
}
