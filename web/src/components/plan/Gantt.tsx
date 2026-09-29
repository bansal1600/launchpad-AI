"use client";
import { useRef } from "react";
import type { Plan } from "@/lib/schemas";
import { addDays, daysBetween, fmtShort } from "@/lib/dates";
import { LEVEL_COLOR, LEVEL_LABEL, Section, Swatch } from "@/components/plan/PlanView";
import { useTip, useWidth } from "@/components/ui/useTip";

export default function Gantt({ plan, previous, onSelect, done, bare }: { plan: Plan; previous?: Plan; onSelect?: (id: string) => void; done?: Set<string>; bare?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const W = Math.max(useWidth(box), 600);
  const { handlers, node } = useTip();
  const p = plan.profile, start = p.planStartDate;
  const labelW = W < 760 ? 170 : 250, rowH = 26, top = 28, pad = 18;
  const target = p.targetOpenDate ? daysBetween(start, p.targetOpenDate) : null;
  const rows = plan.items;
  const rowOf = new Map(rows.map((r, k) => [r.ruleId, k]));
  const maxDay = Math.max(plan.days.max, ...rows.filter(r => r.gatesOpening).map(r => r.slowEndDay), target ?? 0, previous?.days.typical ?? 0, 30) + 10;
  const x = (d: number) => labelW + (d / maxDay) * (W - labelW - pad);
  const H = top + (rows.length + 1) * rowH + 32;
  const s0 = new Date(start + "T00:00:00Z");
  const months: { day: number; label: string }[] = [];
  for (let m = 1; m < 36; m++) {
    const d = new Date(Date.UTC(s0.getUTCFullYear(), s0.getUTCMonth() + m, 1));
    const day = daysBetween(start, d.toISOString().slice(0, 10));
    if (day > maxDay) break;
    months.push({ day, label: d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }) + (d.getUTCMonth() === 0 ? ` ’${String(d.getUTCFullYear()).slice(2)}` : "") });
  }
  const openY = top + rows.length * rowH;
  const vline = (d: number, color: string, label: string, dash: string | undefined, anchorEnd: boolean, y: number) => (
    <g key={label}>
      <line x1={x(d)} x2={x(d)} y1={top - 4} y2={H - 22} stroke={color} strokeWidth={1.5} strokeDasharray={dash} />
      <text x={x(d) + (anchorEnd ? -4 : 4)} y={y} fontSize={11} fontWeight={600} fill={color} textAnchor={anchorEnd ? "end" : "start"}>{label}</text>
    </g>
  );
  const moved = previous && previous.days.typical !== plan.days.typical;
  const body = (
    <>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2">
        {["city", "county", "state", "federal"].map(l => <span key={l} className="inline-flex items-center gap-1.5"><Swatch c={LEVEL_COLOR[l]} />{LEVEL_LABEL[l]}</span>)}
        <span className="inline-flex items-center gap-1.5"><svg width="14" height="10" aria-hidden><rect width="14" height="10" rx="3" fill="url(#hatch)" stroke="var(--work)" /></svg>Your construction or setup</span>
        <span className="inline-flex items-center gap-1.5"><svg width="14" height="10" aria-hidden><rect x="1" y="1" width="12" height="8" rx="3" fill="none" stroke="var(--ink)" strokeWidth="2" /></svg>Critical path: delays here delay opening</span>
        <span className="inline-flex items-center gap-1.5"><svg width="16" height="10" aria-hidden><line x1="0" y1="5" x2="15" y2="5" stroke="var(--ink-3)" strokeWidth="2" /><line x1="15" y1="1" x2="15" y2="9" stroke="var(--ink-3)" strokeWidth="2" /></svg>If it runs slow</span><span className="inline-flex items-center gap-1.5"><svg width="16" height="10" aria-hidden><path d="M0,2 H6 V8 H15" fill="none" stroke="var(--ink)" strokeWidth="1.5" /></svg>Waits for</span>
      </div>
      <div ref={box} className="relative overflow-x-auto" {...handlers}>
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Timeline from ${fmtShort(start)} to opening ${fmtShort(plan.openDate.typical)}`} className="block">
          <defs><pattern id="hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="var(--surface-2)" /><line x1="0" y1="0" x2="0" y2="6" stroke="var(--work)" strokeWidth="2.5" /></pattern></defs>
          {months.map(m => (
            <g key={m.day}>
              <line x1={x(m.day)} x2={x(m.day)} y1={top - 6} y2={H - 24} stroke="var(--line)" />
              <text x={x(m.day)} y={top - 12} fontSize={11} fill="var(--ink-3)" textAnchor="middle">{m.label}</text>
            </g>
          ))}
          {rows.flatMap(r => r.dependsOn.map(d => rows[rowOf.get(d)!]).filter(d => d.endDay === r.startDay && r.startDay > 0).map(d => {
            const x1 = x(d.endDay), y1 = top + rowOf.get(d.ruleId)! * rowH + rowH / 2, x2 = x(r.startDay), y2 = top + rowOf.get(r.ruleId)! * rowH + rowH / 2;
            const crit = d.isCriticalPath && r.isCriticalPath;
            return <path key={d.ruleId + r.ruleId} d={`M${x1},${y1} H${x1 + 4} V${y2} H${x2}`} fill="none" stroke={crit ? "var(--ink)" : "var(--ink-3)"} strokeWidth={crit ? 1.5 : 1} opacity={crit ? 0.8 : 0.35} />;
          }))}
          {rows.map((r, k) => {
            const y = top + k * rowH, by = y + 6, bh = rowH - 12, c = LEVEL_COLOR[r.level];
            const max = Math.floor(labelW / 7);
            const label = (done?.has(r.ruleId) ? "✓ " : "") + r.plainName;
            const name = label.length > max ? label.slice(0, max - 1) + "…" : label;
            return (
              <g key={r.ruleId}>
                <text x={labelW - 10} y={y + rowH / 2 + 4} fontSize={12} textAnchor="end" fill={r.isCriticalPath ? "var(--ink)" : "var(--ink-2)"} fontWeight={r.isCriticalPath ? 600 : 400}>{name}</text>
                <line x1={x(r.endDay)} x2={x(r.slowEndDay)} y1={by + bh / 2} y2={by + bh / 2} stroke={c} strokeWidth={2} opacity={0.45} />
                <line x1={x(r.slowEndDay)} x2={x(r.slowEndDay)} y1={by + 3} y2={by + bh - 3} stroke={c} strokeWidth={2} opacity={0.45} />
                <rect x={x(r.startDay)} y={by} width={Math.max(4, x(r.endDay) - x(r.startDay))} height={bh} rx={4} opacity={done?.has(r.ruleId) ? 0.35 : 1}
                  fill={r.level === "work" ? "url(#hatch)" : c} stroke={r.isCriticalPath ? "var(--ink)" : undefined} strokeWidth={r.isCriticalPath ? 2 : 0} />
                <rect x={0} y={y} width={W} height={rowH} fill="transparent" style={onSelect ? { cursor: "pointer" } : undefined} onClick={() => onSelect?.(r.ruleId)}
                  data-tip={`${r.plainName}\n${LEVEL_LABEL[r.level]}${r.isCriticalPath ? " · critical path" : ""}\n${fmtShort(addDays(start, r.startDay))} → ${fmtShort(addDays(start, r.endDay))} (~${r.durationDays.typical} days)\nIf slow: done ${fmtShort(addDays(start, r.slowEndDay))}`} />
              </g>
            );
          })}
          <text x={labelW - 10} y={openY + rowH / 2 + 4} fontSize={12} textAnchor="end" fill="var(--ink)" fontWeight={600}>Open for business</text>
          <path d={`M${x(plan.days.typical)} ${openY + 4} l8 9 l-8 9 l-8 -9z`} fill="var(--accent)" />
          {moved && vline(previous!.days.typical, "var(--ink-3)", `was ${fmtShort(previous!.openDate.typical)}`, "2 3", previous!.days.typical < plan.days.typical, H - 8)}
          {target !== null && vline(target, target >= plan.days.typical ? "var(--good)" : "var(--crit)", `Target ${fmtShort(p.targetOpenDate!)}`, "5 4", target < plan.days.typical, moved ? H - 8 - 0 : H - 8)}
          {vline(plan.days.typical, "var(--accent)", `Opens ${fmtShort(plan.openDate.typical)}`, undefined, target !== null && target > plan.days.typical, openY + rowH + 12)}
        </svg>
        {node}
      </div>
    </>
  );
  return bare ? body : <Section title="Timeline to opening day">{body}</Section>;
}
