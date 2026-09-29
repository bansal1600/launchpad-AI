import { geocode } from "@/lib/services/geocode";

export async function POST(req: Request) {
  const { address } = (await req.json()) as { address?: string };
  if (!address?.trim()) return Response.json({ ok: false, error: "Enter an address." }, { status: 400 });
  try {
    return Response.json(await geocode(address));
  } catch {
    return Response.json({ ok: false, error: "The address lookup service didn't respond. Try again in a moment." }, { status: 502 });
  }
}
