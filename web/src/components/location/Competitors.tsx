"use client";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { Plan } from "@/lib/schemas";
import { Section } from "@/components/plan/PlanView";
import { walkMin } from "@/components/location/placeMeta";

const CompetitorMap = dynamic(() => import("@/components/location/CompetitorMap"), { ssr: false, loading: () => <div className="aspect-square w-full rounded-lg bg-surface-2" /> });
const RADII = [{ m: 400, label: "5-min walk" }, { m: 800, label: "10-min walk" }, { m: 1609, label: "1 mile" }];
const PLURAL = { cafe: "cafés", restaurant: "restaurants", retail_boutique: "boutiques" } as const;
export type Rival = { id: string; name: string; lat: number; lng: number; distanceMeters: number; kind: string; detail?: string };
type Data = { radiusMeters: number; count: number; perSqMile: number; saturation: "low" | "medium" | "high"; items: Rival[]; source: string; error?: string };

export default function Competitors({ plan }: { plan: Plan }) {
  const [radius, setRadius] = useState(800);
  const [data, setData] = useState<Data | null>(null);
  const { lat, lng } = plan.profile.address;
  const type = plan.profile.businessType;
  useEffect(() => {
    if (lat == null || lng == null) return;
    let live = true;
    fetch(`/api/competitors?lat=${lat}&lng=${lng}&type=${type}&radius=${radius}`).then(r => r.json()).then(d => live && setData(d)).catch(() => live && setData(null));
    return () => { live = false; };
  }, [lat, lng, type, radius]);
  if (lat == null || lng == null) return null;
  const sat = data?.saturation;
  const bands = [400, 800, 1609].map(r => ({ r, n: data?.items.filter(i => i.distanceMeters <= r).length ?? 0 }));
  const take = !data ? "" : sat === "high" ? `Crowded. A new one here needs a clear reason for customers to pick it over ${data.count} nearby options.`
    : sat === "medium" ? "There's room, but you'll be compared with established neighbors." : "Few direct competitors nearby. Check there's enough foot traffic to support you.";
  return (
    <Section title="Who you'd compete with" right={
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="Radius">{RADII.map(r => <button key={r.m} className="chip" aria-pressed={radius === r.m} onClick={() => setRadius(r.m)}>{r.label}</button>)}</div>}>
      {data?.error ? <p className="text-ink-3">{data.error}</p> : (
        <div className="grid items-start gap-5 md:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
          <CompetitorMap lat={lat} lng={lng} radius={radius} items={data?.items ?? []} />
          {data && (
            <div className="grid min-w-0 gap-3">
              <p className="text-[15px]"><strong>{data.count} {PLURAL[type]}</strong> within a {RADII.find(r => r.m === radius)?.label.toLowerCase()}</p>
              <div className="flex items-center gap-2">
                <span className={`pill ${sat === "high" ? "bg-crit-soft text-crit" : sat === "medium" ? "bg-accent-soft text-accent" : "bg-good-soft text-good"}`}>Saturation: {sat}</span>
                <span className="text-xs text-ink-3">{data.perSqMile} per sq mi</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {bands.map(b => (
                  <div key={b.r} className="rounded-lg bg-surface-2 p-2.5 text-center">
                    <div className="font-display text-xl font-bold num">{b.r <= radius ? b.n : "—"}</div>
                    <div className="text-[11px] text-ink-3">{RADII.find(r => r.m === b.r)?.label}</div>
                  </div>
                ))}
              </div>
              <p className="text-ink-2">{take}</p>
              <div className="max-h-64 overflow-auto border-t border-line">
                <table className="w-full text-[13px]"><tbody>
                  {data.items.map(c => (
                    <tr key={c.id} className="border-b border-line">
                      <td className="py-1.5 pr-2"><span className="font-medium">{c.name}</span>{c.detail && <span className="block text-xs capitalize text-ink-3">{c.detail}</span>}</td>
                      <td className="whitespace-nowrap py-1.5 text-right text-xs text-ink-2 num">{walkMin(c.distanceMeters)} min walk</td>
                    </tr>
                  ))}
                  {!data.items.length && <tr><td className="py-2 text-ink-3">None in this radius. Try a wider one.</td></tr>}
                </tbody></table>
              </div>
              <p className="text-xs text-ink-3">Source: {data.source}. County health inspection scores can be added from the County&apos;s inspection data.</p>
            </div>
          )}
        </div>
      )}
    </Section>
  );
}
