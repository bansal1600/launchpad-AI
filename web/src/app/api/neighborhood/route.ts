import { neighborhood } from "@/lib/services/neighborhood";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const lat = Number(q.get("lat")), lng = Number(q.get("lng")), tract = q.get("tract") ?? undefined;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return Response.json({ error: "lat and lng are required" }, { status: 400 });
  return Response.json(await neighborhood(lat, lng, tract));
}
