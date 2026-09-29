"use client";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import type { Plan } from "@/lib/schemas";
import { kmoney } from "@/lib/dates";
import { Section } from "@/components/plan/PlanView";
import { useWidth } from "@/components/ui/useTip";
import { PLACE_CATS, PLACE_META, walkMin, type Place, type PlaceCat } from "@/components/location/placeMeta";

const LocationMap = dynamic(() => import("@/components/location/LocationMap"), { ssr: false, loading: () => <div className="h-[460px] w-full rounded-xl bg-surface-2" /> });

type Census = { release: string; residents: number; households: number; medianIncome: number; countyMedianIncome: number; medianAge: number; countyMedianAge: number; renterPct: number; transitWalkPct: number; countyTransitWalkPct: number };
type Data = { census: Census | null; places: Place[]; within10: Record<PlaceCat, number>; activity: { weekday: number[]; weekend: number[] }; sources: string[] };
const hourLabel = (h: number) => (h === 0 ? "12a" : h < 12 ? `${h}a` : h === 12 ? "12p" : `${h - 12}p`);

export default function NeighborhoodView({ plan }: { plan: Plan }) {
  const { lat, lng } = plan.profile.address;
  const tract = plan.profile.jurisdiction?.censusTract;
  const [d, setD] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [show, setShow] = useState<Set<PlaceCat>>(new Set(["bus", "rail", "parking"]));
  useEffect(() => {
    if (lat == null || lng == null) return;
    let live = true;
    fetch(`/api/neighborhood?lat=${lat}&lng=${lng}${tract ? `&tract=${tract}` : ""}`).then(r => r.json()).then(x => live && setD(x)).catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [lat, lng, tract]);
  if (lat == null || lng == null) return null;
  const toggle = (c: PlaceCat) => setShow(s => { const n = new Set(s); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <Section title="The neighborhood" right={d && <span className="text-xs text-ink-3">Sources: {d.sources.join(" · ")}</span>}>
      {!d ? <p className="text-ink-3">{failed ? "Couldn't load neighborhood data right now. Try again in a moment." : "Loading real data for this address…"}</p> : <>
        {d.census && <CensusTiles c={d.census} />}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <LocationMap lat={lat} lng={lng} places={d.places} show={show} />
          <div className="grid content-start gap-3">
            <div>
              <h3 className="text-[15px] font-bold">Within a 10-minute walk</h3>
              <p className="text-xs text-ink-3">Tap to show or hide on the map.</p>
            </div>
            <WalkBars counts={d.within10} show={show} toggle={toggle} />
          </div>
        </div>

        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {(["bus", "rail", "parking", "bike"] as PlaceCat[]).map(c => <Nearest key={c} cat={c} places={d.places.filter(p => p.cat === c)} onShow={() => !show.has(c) && toggle(c)} />)}
        </div>

        <div className="grid gap-2">
          <h3 className="text-[15px] font-bold">When the block is busiest</h3>
          <Activity weekday={d.activity.weekday} weekend={d.activity.weekend} />
          <p className="text-xs text-ink-3">Estimated activity by hour, modeled from the offices, schools, shops, restaurants and transit within a 5-minute walk (OpenStreetMap). A guide to timing, not a people count.</p>
        </div>
      </>}
    </Section>
  );
}

function CensusTiles({ c }: { c: Census }) {
  const tiles = [
    { label: "People living here", value: c.residents.toLocaleString(), sub: `${c.households.toLocaleString()} households in this census tract` },
    { label: "Median household income", value: kmoney(c.medianIncome), cmp: [c.medianIncome, c.countyMedianIncome], fmt: kmoney },
    { label: "Median age", value: String(c.medianAge), cmp: [c.medianAge, c.countyMedianAge], fmt: (v: number) => String(v) },
    { label: "Rent their home", value: `${Math.round(c.renterPct)}%`, sub: "of households (renters move more and try new places)" },
    { label: "Walk or take transit to work", value: `${c.transitWalkPct}%`, cmp: [c.transitWalkPct, c.countyTransitWalkPct], fmt: (v: number) => `${v}%` },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      {tiles.map(t => (
        <div key={t.label} className="grid content-start gap-1 rounded-lg bg-surface-2 px-3.5 py-3">
          <span className="eyebrow">{t.label}</span>
          <span className="font-display text-2xl font-bold num">{t.value}</span>
          {t.cmp ? <MiniCompare here={t.cmp[0]} county={t.cmp[1]} fmt={t.fmt!} /> : <span className="text-xs text-ink-2">{t.sub}</span>}
        </div>
      ))}
    </div>
  );
}

function MiniCompare({ here, county, fmt }: { here: number; county: number; fmt: (v: number) => string }) {
  const max = Math.max(here, county) * 1.05;
  return (
    <div className="grid gap-1 text-[11px] text-ink-2">
      {[["Here", here, "var(--accent)"], ["County", county, "var(--ink-3)"]].map(([l, v, c]) => (
        <div key={l as string} className="grid grid-cols-[42px_1fr_auto] items-center gap-1.5">
          <span>{l}</span><span className="h-1.5 rounded-full" style={{ width: `${((v as number) / max) * 100}%`, background: c as string }} /><span className="num">{fmt(v as number)}</span>
        </div>
      ))}
    </div>
  );
}

function WalkBars({ counts, show, toggle }: { counts: Record<PlaceCat, number>; show: Set<PlaceCat>; toggle: (c: PlaceCat) => void }) {
  const max = Math.max(...Object.values(counts), 1);
  return (
    <div className="grid gap-1.5">
      {PLACE_CATS.map(c => (
        <button key={c} onClick={() => toggle(c)} aria-pressed={show.has(c)} className={`grid grid-cols-[26px_1fr_auto] items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[13px] transition-opacity hover:bg-surface-2 ${show.has(c) ? "" : "opacity-50"}`}>
          <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: PLACE_META[c].color }}>
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={PLACE_META[c].icon} /></svg>
          </span>
          <span className="grid gap-0.5">
            <span>{PLACE_META[c].label}</span>
            <span className="h-1.5 rounded-full" style={{ width: `${Math.max(3, (counts[c] / max) * 100)}%`, background: PLACE_META[c].color }} />
          </span>
          <span className="font-semibold num">{counts[c]}</span>
        </button>
      ))}
    </div>
  );
}

function Nearest({ cat, places, onShow }: { cat: PlaceCat; places: Place[]; onShow: () => void }) {
  const top = places.slice(0, 3);
  return (
    <div className="grid content-start gap-2">
      <h3 className="flex items-center gap-2 text-[15px] font-bold">
        <span className="grid h-6 w-6 place-items-center rounded-full" style={{ background: PLACE_META[cat].color }}><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={PLACE_META[cat].icon} /></svg></span>
        Nearest {PLACE_META[cat].label.toLowerCase()}
      </h3>
      {top.length ? (
        <ul className="grid gap-2">
          {top.map(p => (
            <li key={p.id} className="grid grid-cols-[1fr_auto] gap-2 border-b border-line pb-2 text-[13px]">
              <button onClick={onShow} className="text-left"><span className="font-medium">{p.name}</span><span className="block text-xs text-ink-3">{p.kind}{p.detail ? ` · ${p.detail}` : ""}</span></button>
              <span className="whitespace-nowrap text-right text-xs text-ink-2 num">{walkMin(p.meters)} min walk</span>
            </li>
          ))}
        </ul>
      ) : <p className="text-[13px] text-ink-3">None within a 12-minute walk.</p>}
    </div>
  );
}

function Activity({ weekday, weekend }: { weekday: number[]; weekend: number[] }) {
  const box = useRef<HTMLDivElement>(null);
  const W = Math.max(useWidth(box, 700), 320), H = 200, L = 36, R = 12, T = 12, B = 26;
  const [hover, setHover] = useState<number | null>(null);
  const hours = Array.from({ length: 18 }, (_, i) => i + 6);
  const x = (h: number) => L + ((h - 6) / 17) * (W - L - R);
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = (s: number[]) => hours.map((h, i) => `${i ? "L" : "M"}${x(h)},${y(s[h])}`).join("");
  const series = [{ name: "Weekday", data: weekday, c: "var(--s1)" }, { name: "Weekend", data: weekend, c: "var(--s2)" }];
  const peak = (s: number[]) => hours.reduce((a, h) => (s[h] > s[a] ? h : a), 6);
  return (
    <div ref={box} className="relative">
      <div className="mb-1 flex flex-wrap gap-4 text-xs text-ink-2">
        {series.map(s => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-0.5 w-4 rounded" style={{ background: s.c }} />{s.name} · busiest around <strong>{hourLabel(peak(s.data))}</strong></span>)}
      </div>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Estimated activity by hour" className="block"
        onPointerMove={e => { const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect(); const h = Math.round(6 + ((e.clientX - r.left - L) / (W - L - R)) * 17); setHover(h >= 6 && h <= 23 ? h : null); }}
        onPointerLeave={() => setHover(null)}>
        {[0, 50, 100].map(t => <g key={t}><line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--line)" /><text x={L - 6} y={y(t) + 4} fontSize={11} textAnchor="end" fill="var(--ink-3)">{t === 100 ? "Peak" : t === 0 ? "Quiet" : ""}</text></g>)}
        {[6, 9, 12, 15, 18, 21].map(h => <text key={h} x={x(h)} y={H - 8} fontSize={11} textAnchor="middle" fill="var(--ink-3)">{hourLabel(h)}</text>)}
        {series.map(s => <path key={s.name + "a"} d={`${path(s.data)}L${x(23)},${y(0)}L${x(6)},${y(0)}Z`} fill={s.c} opacity={0.08} />)}
        {series.map(s => <path key={s.name} d={path(s.data)} fill="none" stroke={s.c} strokeWidth={2} strokeLinejoin="round" />)}
        {hover !== null && <g><line x1={x(hover)} x2={x(hover)} y1={T} y2={H - B} stroke="var(--ink-3)" strokeDasharray="3 3" />{series.map(s => <circle key={s.name} cx={x(hover)} cy={y(s.data[hover])} r={4.5} fill={s.c} stroke="var(--surface)" strokeWidth={2} />)}</g>}
      </svg>
      {hover !== null && <div className="pointer-events-none absolute top-6 rounded-md bg-ink px-2.5 py-1.5 text-xs text-surface shadow" style={{ left: Math.min(x(hover) + 10, W - 150) }}>
        <div className="font-semibold">{hourLabel(hover)}–{hourLabel((hover + 1) % 24)}</div>{series.map(s => <div key={s.name}>{s.name}: {s.data[hover]}% of peak</div>)}</div>}
    </div>
  );
}
