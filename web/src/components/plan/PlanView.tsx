"use client";
import { useState } from "react";
import { PHASES, type Phase, type Plan, type PlanDiff } from "@/lib/schemas";
import { FIELD_LABELS, VALUE_LABELS } from "@/lib/defaults";
import { placeName } from "@/lib/engine/diff";
import { addDays, daysBetween, fmtDate, fmtShort, kmoney, money, spanText } from "@/lib/dates";
import RoadmapView, { PHASE_INFO } from "@/components/plan/RoadmapView";
import CostChart from "@/components/plan/CostChart";
import Competitors from "@/components/location/Competitors";
import NeighborhoodView from "@/components/location/NeighborhoodView";
import Incentives from "@/components/plan/Incentives";

type Props = { plan: Plan; previous?: Plan; diff?: PlanDiff };

export const LEVEL_COLOR: Record<string, string> = { city: "var(--s1)", county: "var(--s2)", state: "var(--s3)", federal: "var(--s4)", work: "var(--work)" };
export const LEVEL_LABEL: Record<string, string> = { city: "City", county: "County", state: "State", federal: "Federal", work: "Your work" };

export function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="panel p-5 grid gap-3.5 min-w-0">
      <div className="flex flex-wrap items-center gap-3"><h2 className="text-lg font-bold">{title}</h2><div className="ml-auto">{right}</div></div>
      {children}
    </section>
  );
}

type Tab = "overview" | "roadmap" | "costs" | "location" | "grants";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "roadmap", label: "Roadmap" },
  { id: "costs", label: "Costs" }, { id: "location", label: "Location" }, { id: "grants", label: "Grants & help" },
];

/** Which tabs the latest change touched, so the owner can see where to look. */
function changedTabs(diff?: PlanDiff): Set<Tab> {
  const t = new Set<Tab>();
  if (!diff) return t;
  if (diff.added.length || diff.removed.length || diff.openDeltaDays) t.add("roadmap");
  if (Math.round(diff.costDelta)) t.add("costs");
  if (diff.gained.length || diff.lost.length) t.add("grants");
  if (diff.jurisdiction) t.add("location");
  return t;
}

export default function PlanView({ plan, previous, diff }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [phase, setPhase] = useState<Phase | "all">("all");
  const [seen, setSeen] = useState<{ diff?: PlanDiff; tabs: Set<Tab> }>({ tabs: new Set() });
  // Reset the "new" dots whenever a new change arrives.
  if (seen.diff !== diff) setSeen({ diff, tabs: new Set() });
  const dots = changedTabs(diff);
  const go = (t: Tab, p?: Phase | "all") => { setTab(t); setPhase(p ?? "all"); setSeen(s => ({ ...s, tabs: new Set([...s.tabs, t]) })); if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" }); };

  return (
    <main className="grid min-w-0 content-start gap-5">
      <nav className="sticky top-0 z-20 -mx-1 flex gap-1 overflow-x-auto bg-bg px-1 py-1.5" aria-label="Plan sections" style={{ top: "env(safe-area-inset-top, 0px)" }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => go(t.id)} aria-current={tab === t.id ? "page" : undefined}
            className={`relative whitespace-nowrap rounded-lg px-3.5 py-2 text-[14px] font-medium transition-colors ${tab === t.id ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface"}`}>
            {t.label}
            {dots.has(t.id) && !seen.tabs.has(t.id) && tab !== t.id && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-accent" aria-label="updated" />}
          </button>
        ))}
      </nav>

      {tab === "overview" && <>
        <Jurisdiction plan={plan} />
        <Kpis plan={plan} previous={previous} diff={diff} go={go} />
        <Journey plan={plan} go={go} />
        <Assumptions plan={plan} />
      </>}
      {tab === "roadmap" && <RoadmapView plan={plan} previous={previous} diff={diff} focusPhase={phase} onClearFocus={() => setPhase("all")} />}
      {tab === "costs" && <CostChart plan={plan} previous={previous} />}
      {tab === "location" && <><NeighborhoodView plan={plan} /><Competitors plan={plan} /></>}
      {tab === "grants" && <Incentives plan={plan} diff={diff} />}
    </main>
  );
}

/** The path to opening as five clickable phases, sized by how long each takes. */
function Journey({ plan, go }: { plan: Plan; go: (t: Tab, p?: Phase | "all") => void }) {
  const phases = PHASES.map(p => {
    const items = plan.items.filter(i => i.phase === p);
    if (!items.length) return null;
    const start = Math.min(...items.map(i => i.startDay)), end = Math.max(...items.map(i => i.endDay));
    return { p, items, start, end, critical: items.some(i => i.isCriticalPath), fees: items.reduce((s, i) => s + i.fee.typical, 0) };
  }).filter((x): x is NonNullable<typeof x> => !!x);
  const total = Math.max(plan.days.typical, ...phases.map(x => x.end), 1);
  const start = plan.profile.planStartDate;
  return (
    <section className="panel grid gap-4 p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-lg font-bold">Your path to opening</h2>
        <span className="text-[13px] text-ink-2">{plan.items.filter(i => i.level !== "work").length} steps in {phases.length} stages. Tap a stage to see its steps.</span>
      </div>
      <ol className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
        {phases.map((x, k) => (
          <li key={x.p}>
            <button onClick={() => go("roadmap", x.p)} className="group grid h-full w-full content-start gap-1.5 rounded-lg border border-line bg-bg p-3.5 text-left transition-colors hover:border-accent hover:bg-accent-soft/40">
              <span className="flex items-center gap-2">
                <span className={`grid h-6 w-6 place-items-center rounded-full text-xs font-bold ${x.critical ? "bg-ink text-surface" : "bg-surface-2 text-ink-2"}`}>{k + 1}</span>
                <span className="text-xs text-ink-3">{x.p === "after_open" ? "after opening" : x.start === 0 ? "start now" : `from ${fmtShort(addDays(start, x.start))}`}</span>
              </span>
              <span className="font-semibold leading-snug">{PHASE_INFO[x.p].title}</span>
              <span className="text-[13px] text-ink-2">{x.items.length} step{x.items.length > 1 ? "s" : ""} · ~{Math.max(1, Math.round((x.end - x.start) / 7))} wk{x.fees ? ` · ${kmoney(x.fees)} fees` : ""}</span>
              <span className="text-xs font-medium text-accent opacity-0 transition-opacity group-hover:opacity-100">See steps →</span>
            </button>
          </li>
        ))}
      </ol>
      <div className="grid gap-1.5" aria-label="How the months break down">
        {phases.filter(x => x.p !== "after_open").map(x => (
          <button key={x.p} onClick={() => go("roadmap", x.p)} className="grid grid-cols-[130px_1fr] items-center gap-3 text-left text-xs sm:grid-cols-[170px_1fr]">
            <span className="truncate text-ink-2">{PHASE_INFO[x.p].short}</span>
            <span className="relative h-3 rounded-full bg-surface-2">
              <span className={`absolute inset-y-0 rounded-full ${x.critical ? "bg-ink" : "bg-ink-3/60"}`} style={{ left: `${(x.start / total) * 100}%`, width: `${Math.max(1.5, ((x.end - x.start) / total) * 100)}%` }} />
            </span>
          </button>
        ))}
        <div className="grid grid-cols-[130px_1fr] gap-3 text-[11px] text-ink-3 sm:grid-cols-[170px_1fr]"><span /><span className="flex justify-between"><span>Today</span><span>Opens {fmtShort(plan.openDate.typical)}</span></span></div>
      </div>
    </section>
  );
}

function Jurisdiction({ plan }: { plan: Plan }) {
  const p = plan.profile, j = p.jurisdiction;
  if (!j) return null;
  const local = j.kind === "unincorporated" ? "Santa Clara County (zoning + building)" : j.kind === "out_of_area" ? "Local government" : `City of ${j.cityName}`;
  const chain: [string, string][] = [
    [j.kind === "unincorporated" ? "county" : "city", local],
    ...(j.kind === "city" ? [["county", "Santa Clara County (health)"] as [string, string]] : []),
    ["state", "State of California"], ["federal", "Federal"],
  ];
  return (
    <section className="panel p-5 grid gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <div className="eyebrow">Who regulates this address</div>
          <h1 className="text-2xl font-bold">{j.kind === "unincorporated" ? "Santa Clara County" : j.kind === "out_of_area" ? "Outside our coverage" : `City of ${j.cityName}`}</h1>
        </div>
        {!j.supported && <span className="pill bg-surface-2 text-ink-2">City steps estimated</span>}
      </div>
      <div className="text-ink-2">{p.address.normalized ?? p.address.raw}{j.censusTract ? ` · Census tract ${j.censusTract}` : ""}</div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        {chain.map(([lvl, name], i) => (
          <span key={name} className="contents">
            {i > 0 && <span className="text-ink-3">→</span>}
            <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-bg px-2 py-1"><Swatch c={LEVEL_COLOR[lvl]} />{name}</span>
          </span>
        ))}
      </div>
    </section>
  );
}

export const Swatch = ({ c }: { c: string }) => <span className="inline-block h-2.5 w-2.5 flex-none rounded-[3px]" style={{ background: c }} />;

/** Read-only: what the plan is assuming until the owner says otherwise in the chat. */
function Assumptions({ plan }: { plan: Plan }) {
  const p = plan.profile;
  const shown = p.assumed.filter(f => f !== "seats" && f !== "groundFloor");
  if (!shown.length) return null;
  return (
    <p className="rounded-lg border border-dashed border-line px-4 py-2.5 text-[13px] text-ink-2">
      <span className="font-medium text-ink">Assuming for now:</span>{" "}
      {shown.map(f => `${FIELD_LABELS[f] ?? f}: ${formatValue(f, p[f as keyof typeof p])}`).join(" · ")}.{" "}
      <span className="text-ink-3">Tell the chat anything that&apos;s different.</span>
    </p>
  );
}

export function formatValue(field: string, v: unknown): string {
  if (VALUE_LABELS[field]) return VALUE_LABELS[field][String(v)] ?? String(v);
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (field === "squareFeet") return `${Number(v).toLocaleString()} sq ft`;
  if (field === "monthlyRentUsd") return `${money(Number(v))}/mo`;
  if (field === "budgetUsd") return money(Number(v));
  return String(v);
}

function Kpis({ plan, previous, diff, go }: { plan: Plan; previous?: Plan; diff?: PlanDiff; go: (t: Tab) => void }) {
  const p = plan.profile;
  const permits = plan.items.filter(i => i.level !== "work");
  const slack = p.targetOpenDate ? daysBetween(plan.openDate.typical, p.targetOpenDate) : null;
  const over = p.budgetUsd ? plan.costs.total.typical - p.budgetUsd : null;
  const inc = plan.incentives.filter(i => i.match !== "not_eligible");
  const dOpen = previous ? plan.days.typical - previous.days.typical : 0;
  const dCost = previous ? plan.costs.total.typical - previous.costs.total.typical : 0;
  const levels = ["city", "county", "state", "federal"].map(l => [l, permits.filter(i => i.level === l).length] as const).filter(([, n]) => n);
  return (
    <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 2xl:grid-cols-4">
      <Kpi onClick={() => go("roadmap")} label="Realistic opening" value={fmtDate(plan.openDate.typical)} sub={`Range ${fmtShort(plan.openDate.fast)} – ${fmtDate(plan.openDate.slow)}`}>
        {slack !== null ? <span className={`pill w-fit ${slack >= 0 ? "bg-good-soft text-good" : "bg-crit-soft text-crit"}`}>{slack >= 0 ? `✓ ${spanText(slack)} before target` : `✕ ${spanText(slack)} after target`}</span>
          : <span className="text-xs text-ink-3">Tell the chat your target date</span>}
        <Delta v={dOpen} text={`${dOpen > 0 ? "+" : "−"}${spanText(dOpen)}`} />
      </Kpi>
      <Kpi onClick={() => go("costs")} label="Startup cost (typical)" value={kmoney(plan.costs.total.typical)} sub={`Range ${kmoney(plan.costs.total.low)} – ${kmoney(plan.costs.total.high)}`}>
        {over !== null ? <span className={`pill w-fit ${over <= 0 ? "bg-good-soft text-good" : "bg-crit-soft text-crit"}`}>{over <= 0 ? `✓ ${kmoney(-over)} under budget` : `✕ ${kmoney(over)} over budget`}</span>
          : <span className="text-xs text-ink-3">Tell the chat your budget</span>}
        <Delta v={Math.round(dCost)} text={`${dCost > 0 ? "+" : "−"}${kmoney(Math.abs(dCost))}`} />
      </Kpi>
      <Kpi onClick={() => go("roadmap")} label="Permits & registrations" value={String(permits.length)} sub={levels.map(([l, n]) => `${n} ${LEVEL_LABEL[l].toLowerCase()}`).join(" · ")}>
        <span className="text-xs text-ink-2">{permits.filter(i => i.isCriticalPath).length} on the critical path</span>
        {diff && (diff.added.length > 0 || diff.removed.length > 0) && <span className="text-xs font-semibold text-ink-2">{diff.added.length ? `+${diff.added.length} ` : ""}{diff.removed.length ? `−${diff.removed.length}` : ""} vs last version</span>}
      </Kpi>
      <Kpi onClick={() => go("grants")} label="Grants & help" value={String(inc.length)} sub={`${inc.filter(i => i.match === "eligible").length} likely · ${inc.filter(i => i.match === "may_qualify").length} worth checking`}>
        {diff?.jurisdiction && <span className="text-xs text-ink-2">Moved from {diff.jurisdiction.from}</span>}
        {plan.profile.jurisdiction && <span className="text-xs text-ink-3">Location: {placeName(plan)}</span>}
      </Kpi>
    </div>
  );
}

function Delta({ v, text }: { v: number; text: string }) {
  return v ? <span className={`text-xs font-semibold ${v > 0 ? "text-crit" : "text-good"}`}>{v > 0 ? "▲" : "▼"} {text} vs last version</span> : null;
}

function Kpi({ label, value, sub, children, onClick }: { label: string; value: string; sub: string; children?: React.ReactNode; onClick: () => void }) {
  return (
    <div role="button" tabIndex={0} onClick={onClick} onKeyDown={e => (e.key === "Enter" || e.key === " ") && onClick()} className="panel group grid cursor-pointer content-start gap-1 px-4 py-3.5 text-left transition-colors hover:border-accent">
      <span className="eyebrow">{label}</span>
      <span className="font-display text-[28px] font-bold leading-tight num">{value}</span>
      <span className="text-xs text-ink-2">{sub}</span>
      {children}
    </div>
  );
}
