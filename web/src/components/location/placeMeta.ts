// Display info for each kind of place on the location map. Icons carry identity alongside color.
export const PLACE_META = {
  bus: { label: "Bus stops", color: "var(--s1)", icon: "M6 4h12a2 2 0 0 1 2 2v10H4V6a2 2 0 0 1 2-2zM4 11h16M7 19v-3M17 19v-3M8 14h.01M16 14h.01" },
  rail: { label: "Train & light rail", color: "var(--s7)", icon: "M7 3h10a2 2 0 0 1 2 2v9a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V5a2 2 0 0 1 2-2zM5 10h14M8 21l2-4M16 21l-2-4" },
  parking: { label: "Parking", color: "var(--s4)", icon: "M6 3h7a5 5 0 0 1 0 10H9v8H6zM9 6v4h4a2 2 0 0 0 0-4z" },
  bike: { label: "Bike share", color: "var(--s3)", icon: "M5.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM18.5 18a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM5.5 14.5 9 7h5l4.5 7.5M9 7l3 7.5h-6.5M14 4h2" },
  food: { label: "Cafés & restaurants", color: "var(--s2)", icon: "M7 3v8a2 2 0 0 0 2 2v8M5 3v5M9 3v5M16 21V3c2 1 3 4 3 7h-3" },
  shops: { label: "Shops", color: "var(--s5)", icon: "M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" },
  offices: { label: "Offices", color: "var(--s6)", icon: "M4 21V5l8-2v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2" },
  community: { label: "Schools, parks & venues", color: "var(--s8)", icon: "M12 3 3 8l9 5 9-5zM6 10v5c3 2.5 9 2.5 12 0v-5" },
} as const;
export type PlaceCat = keyof typeof PLACE_META;
export const PLACE_CATS = Object.keys(PLACE_META) as PlaceCat[];
export type Place = { id: string; cat: PlaceCat; kind: string; name: string; lat: number; lng: number; meters: number; detail?: string };
export const walkMin = (m: number) => Math.max(1, Math.round(m / 80)); // ~80 m per minute
