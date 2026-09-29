// F02: resolve an address to the government that regulates it, via the US Census geocoder (free, no key).
import type { Jurisdiction } from "@/lib/schemas";

// Census place GEOID for San José (verified against the geocoder). Other cities use the Census name.
const SAN_JOSE_GEOID = "0668000";
const SUPPORTED = new Set(["san_jose", "sunnyvale"]);

export type GeocodeResult =
  | { ok: true; normalized: string; lat: number; lng: number; jurisdiction: Jurisdiction }
  | { ok: false; error: string };

type CensusMatch = {
  matchedAddress: string;
  coordinates: { x: number; y: number };
  geographies: Record<string, { GEOID: string; NAME: string; BASENAME: string }[]>;
};

export function jurisdictionFromGeographies(g: CensusMatch["geographies"]): Jurisdiction {
  const county = g["Counties"]?.[0];
  const place = g["Incorporated Places"]?.[0];
  const tract = g["Census Tracts"]?.[0]?.GEOID;
  if (!county || county.GEOID !== "06085")
    return { kind: "out_of_area", county: county?.BASENAME ?? "unknown", cityName: place?.BASENAME, censusTract: tract, supported: false };
  if (!place) return { kind: "unincorporated", county: "santa_clara", cityName: "Unincorporated Santa Clara County", censusTract: tract, supported: true };
  const c = place.GEOID === SAN_JOSE_GEOID ? { id: "san_jose", name: "San José" } : { id: place.BASENAME.toLowerCase().replace(/\W+/g, "_"), name: place.BASENAME };
  return { kind: "city", cityId: c.id, cityName: c.name, county: "santa_clara", censusTract: tract, supported: SUPPORTED.has(c.id) };
}

export async function geocode(address: string): Promise<GeocodeResult> {
  const url = new URL("https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress");
  url.search = new URLSearchParams({
    address, benchmark: "Public_AR_Current", vintage: "Current_Current",
    layers: "Incorporated Places,Counties,Census Tracts", format: "json",
  }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) return { ok: false, error: `Census geocoder returned ${res.status}` };
  const body = (await res.json()) as { result?: { addressMatches?: CensusMatch[] } };
  const m = body.result?.addressMatches?.[0];
  if (!m) return { ok: false, error: "We couldn't find that address. Include a street number, street and city." };
  return { ok: true, normalized: tidyAddress(m.matchedAddress), lat: m.coordinates.y, lng: m.coordinates.x, jurisdiction: jurisdictionFromGeographies(m.geographies) };
}

/** Census returns "87 N SAN PEDRO ST, SAN JOSE, CA, 95110"; show "87 N San Pedro St, San Jose, CA 95110". */
export function tidyAddress(a: string) {
  const parts = a.split(",").map(p => p.trim());
  const zip = /^\d{5}(-\d{4})?$/.test(parts[parts.length - 1] ?? "") ? parts.pop() : undefined;
  const state = parts.pop();
  const title = (p: string) => p.toLowerCase().replace(/\b([a-z])/g, c => c.toUpperCase()).replace(/\b(N|S|E|W|Ne|Nw|Se|Sw)\b/g, d => d.toUpperCase());
  return [...parts.map(title), [state, zip].filter(Boolean).join(" ")].join(", ");
}
