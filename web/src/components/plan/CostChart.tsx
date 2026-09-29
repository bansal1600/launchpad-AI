"use client";
import { useRef } from "react";
import { COST_CATEGORIES, type CostCategory, type Plan } from "@/lib/schemas";
import { kmoney, money } from "@/lib/dates";
import { Section, Swatch } from "@/components/plan/PlanView";
import { useTip, useWidth } from "@/components/ui/useTip";

export const CAT: Record<CostCategory, { label: string; color: string; text: string }> = {
  permits_fees: { label: "Permits & fees", color: "var(--s1)", text: "#fff" },
  deposits: { label: "Deposits", color: "var(--s2)", text: "#15201b" },
  buildout: { label: "Buildout", color: "var(--s3)", text: "#15201b" },
  equipment: { label: "Equipment", color: "var(--s4)", text: "#15201b" },
  inventory: { label: "Opening inventory", color: "var(--s5)", text: "#15201b" },
  professional_services: { label: "Professional help", color: "var(--s6)", text: "#fff" },
  carrying_costs: { label: "Rent while you wait", color: "var(--s7)", text: "#fff" },
  contingency: { label: "Cushion (10%)", color: "var(--s8)", text: "#15201b" },
};

const byCat = (plan: Plan) => Object.fromEntries(COST_CATEGORIES.map(c => {
  const ls = plan.costs.lines.filter(l => l.category === c);
  return [c, { low: ls.reduce((s, l) => s + l.low, 0), typical: ls.reduce((s, l) => s + l.typical, 0), high: ls.reduce((s, l) => s + l.high, 0), lines: ls }];
})) as Record<CostCategory, { low: number; typical: number; high: number; lines: Plan["costs"]["lines"] }>;

export default function CostChart({ plan, previous }: { plan: Plan; previous?: Plan }) {
  const box = useRef<HTMLDivElement>(null);
  const W = Math.max(useWidth(box), 480);
  const { handlers, node } = useTip();
  const now = byCat(plan), before = previous ? byCat(previous) : null;
  const budget = plan.profile.budgetUsd;
  const bars = [...(before ? [["Before", before, previous!.costs.total.typical] as const] : []), ["Now", now, plan.costs.total.typical] as const];
  const labelW = 60, bh = 34, gap = 16, top = 6;
  const maxV = Math.max(...bars.map(b => b[2]), budget ?? 0) * 1.1;
  const sx = (v: number) => (v / maxV) * (W - labelW - 20);
  const H = top + bars.length * (bh + gap) + 20;
  const months = plan.days.typical / 30.4;
  return (
    <Section title="What it will cost to open">
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {COST_CATEGORIES.map(c => <span key={c} className="inline-flex items-center gap-1.5"><Swatch c={CAT[c].color} />{CAT[c].label}</span>)}
      </div>
      <div ref={box} className="overflow-x-auto" {...handlers}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Startup cost by category" className="block">
          {bars.map(([label, cats, total], k) => {
            const y = top + k * (bh + gap);
            let cx = labelW;
            return (
              <g key={label}>
                <text x={0} y={y + bh / 2 + 4} fontSize={12} fontWeight={600} fill="var(--ink-2)">{label}</text>
                {COST_CATEGORIES.map((c, i) => {
                  const w = sx(cats[c].typical);
                  if (w <= 0) return null;
                  const x0 = cx; cx += w;
                  return (
                    <g key={c}>
                      <rect x={x0} y={y} width={Math.max(1, w - 2)} height={bh} rx={i === COST_CATEGORIES.length - 1 ? 4 : 0} fill={CAT[c].color} opacity={label === "Before" ? 0.45 : 1}
                        data-tip={`${CAT[c].label}\n${money(cats[c].typical)} typical\n${money(cats[c].low)} – ${money(cats[c].high)}`} />
                      {label === "Now" && w > 58 && <text x={x0 + 6} y={y + bh / 2 + 4} fontSize={11} fontWeight={600} fill={CAT[c].text} pointerEvents="none" fontFamily="var(--font-plex-mono)">{kmoney(cats[c].typical)}</text>}
                    </g>
                  );
                })}
                <text x={cx + 6} y={y + bh / 2 + 4} fontSize={12} fontWeight={600} fill="var(--ink)">{kmoney(total)}</text>
              </g>
            );
          })}
          {budget ? <g>
            <line x1={labelW + sx(budget)} x2={labelW + sx(budget)} y1={top - 4} y2={H - 16} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="4 3" />
            <text x={labelW + sx(budget)} y={H - 3} fontSize={11} fontWeight={600} textAnchor="middle" fill="var(--ink)">Budget {kmoney(budget)}</text>
          </g> : null}
        </svg>
        {node}
      </div>
      <p className="rounded-lg bg-surface-2 px-3 py-2.5 text-[13px]">
        You&apos;ll likely pay rent for about <strong>{months.toFixed(1)} months</strong> before your first sale. Every extra month of permit delay costs about <strong>{money(plan.costs.monthlyRent)}</strong>.
        {plan.profile.assumed.includes("monthlyRentUsd") && <span className="text-ink-3"> (Rent is assumed; tell the chat your real rent.)</span>}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead><tr className="text-left text-[11px] uppercase tracking-wider text-ink-3"><th className="py-1.5 pr-2 font-semibold">Category</th><th className="py-1.5 pr-2 font-semibold">What&apos;s in it</th><th className="py-1.5 pr-2 text-right font-semibold">Typical</th><th className="py-1.5 pr-2 text-right font-semibold">Range</th>{before && <th className="py-1.5 text-right font-semibold">Change</th>}</tr></thead>
          <tbody>
            {COST_CATEGORIES.map(c => {
              const d = before ? now[c].typical - before[c].typical : 0;
              return (
                <tr key={c} className="border-t border-line">
                  <td className="py-1.5 pr-2 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Swatch c={CAT[c].color} />{CAT[c].label}</span></td>
                  <td className="py-1.5 pr-2 text-ink-2">{now[c].lines.map(l => l.label).join("; ") || "—"}</td>
                  <td className="py-1.5 pr-2 text-right font-mono num">{money(now[c].typical)}</td>
                  <td className="py-1.5 pr-2 text-right font-mono text-ink-2 num whitespace-nowrap">{kmoney(now[c].low)}–{kmoney(now[c].high)}</td>
                  {before && <td className={`py-1.5 text-right font-mono num ${d > 0 ? "text-crit" : d < 0 ? "text-good" : "text-ink-3"}`}>{Math.round(d) ? `${d > 0 ? "+" : "−"}${money(Math.abs(d))}` : "—"}</td>}
                </tr>
              );
            })}
            <tr className="border-t border-line font-semibold"><td className="py-1.5">Total</td><td /><td className="py-1.5 pr-2 text-right font-mono num">{money(plan.costs.total.typical)}</td><td className="py-1.5 pr-2 text-right font-mono text-ink-2 num">{kmoney(plan.costs.total.low)}–{kmoney(plan.costs.total.high)}</td>{before && <td />}</tr>
          </tbody>
        </table>
      </div>
    </Section>
  );
}
