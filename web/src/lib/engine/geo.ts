// Distance helpers shared by the location services.
export const MILE = 1609.34;

/** Great-circle distance in meters. */
export function haversine(aLat: number, aLng: number, bLat: number, bLng: number) {
  const R = 6371000, toR = (d: number) => (d * Math.PI) / 180;
  const dLat = toR(bLat - aLat), dLng = toR(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toR(aLat)) * Math.cos(toR(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
