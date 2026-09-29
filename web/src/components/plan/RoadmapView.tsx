"use client";
import { useEffect, useMemo, useState } from "react";
import type { Phase, Plan, PlanDiff, PlanPermitItem } from "@/lib/schemas";
import { buildWaves } from "@/lib/engine/waves";
import { addDays, fmtShort, kmoney, money } from "@/lib/dates";
import { LEVEL_COLOR, LEVEL_LABEL, Section, Swatch } from "@/components/plan/PlanView";
import Gantt from "@/components/plan/Gantt";
import StepPanel from "@/components/plan/StepPanel";
import StepIcon from "@/components/plan/StepIcon";

export const PHASE_INFO: Record<Phase, { title: string; short: string; blurb: string }> = {
  before_lease: { title: "Before you sign the lease", short: "Before the lease", blurb: "Make sure this space can legally host your business." },
  register: { title: "Set up your business", short: "Set up", blurb: "Mostly online forms. Many are free and take a day or two." },
  build: { title: "Get plans approved and build", short: "Approvals & build", blurb: "The longest stretch. Approvals come before construction, and inspections follow it." },
  before_open: { title: "Before opening day", short: "Before opening", blurb: "Final inspections and the permits that let you open the doors." },
  after_open: { title: "Right after you open", short: "After opening", blurb: "Deadlines that start once you're operating." },
};

/** Per-device "done" ticks, keyed by plan so a new plan starts fresh. */
function useDone(planId: string) {
  const key = `comply-cofounder:done:${planId}`;
  const [done, setDone] = useState<Set<string>>(() => { try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { return new Set(); } });
  useEffect(() => { try { localStorage.setItem(key, JSON.stringify([...done])); } catch { /* ignore */ } }, [done, key]);
  const toggle = (id: string) => setDone(d => { const n = new Set(d); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  return { done, toggle };
}

export default function RoadmapView({ plan, previous, diff, focusPhase, onClearFocus }: { plan: Plan; previous?: Plan; diff?: PlanDiff; focusPhase: Phase | "all"; onClearFocus: () => void }) {
  const [view, setView] = useState<"flow" | "calendar">("flow");
  const [open, setOpen] = useState<string | null>(null);
  const { done, toggle } = useDone(plan.profile.id);
  const waves = useMemo(() => buildWaves(plan), [plan]);
  const byId = new Map(plan.items.map(i => [i.ruleId, i]));
  const num = new Map(waves.flatMap(w => w.items).map((i, k) => [i.ruleId, k + 1]));
  const fresh = new Set(diff?.added.map(i => i.ruleId));
  const steps = plan.items.filter(i => i.level !== "work");
  const doneCount = steps.filter(i => done.has(i.ruleId)).length;
  const start = plan.profile.planStartDate;
  const item = open ? byId.get(open) : undefined;

  return (
    <Section title="Your roadmap" right={
      <div className="flex rounded-lg bg-surface-2 p-0.5 text-[13px]" role="tablist" aria-label="View">
        {([["flow", "Step by step"], ["calendar", "Calendar"]] as const).map(([v, l]) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => setView(v)} className={`rounded-md px-3 py-1.5 font-medium ${view === v ? "bg-surface text-ink shadow-sm" : "text-ink-2"}`}>{l}</button>
        ))}
      </div>}>
      <div className="-mt-1 grid gap-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex min-w-[220px] flex-1 items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-surface-2"><div className="h-full rounded-full bg-accent transition-all" style={{ width: `${(doneCount / Math.max(1, steps.length)) * 100}%` }} /></div>
            <span className="text-[13px] font-medium num whitespace-nowrap">{doneCount} of {steps.length} done</span>
          </div>
          {view === "flow" && <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-2">
            {["city", "county", "state", "federal"].map(l => <span key={l} className="inline-flex items-center gap-1.5"><Swatch c={LEVEL_COLOR[l]} />{LEVEL_LABEL[l]}</span>)}
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px] border-2 border-ink" />Sets opening date</span>
          </div>}
        </div>
        {focusPhase !== "all" && view === "flow" && <p className="flex items-center gap-2 text-[13px]"><span className="pill bg-accent-soft text-accent">Highlighting: {PHASE_INFO[focusPhase].title}</span><button className="text-accent underline" onClick={onClearFocus}>Show all</button></p>}
        <p className="text-[13px] text-ink-2">{view === "flow"
          ? "Each wave is a set of steps that start the same week, so you can work on them side by side. \u201cAfter\u201d on a card shows what must be done first. Tap any step for what to do, documents and who can help."
          : "Every step on a calendar. Lines show what each step waits for; dark bars and lines set your opening date. Tap a row for details."}</p>
      </div>

      {view === "flow" ? (
        <ol className="grid gap-0">
          {waves.map((w, k) => (
            <li key={w.index} className="grid grid-cols-[36px_1fr] gap-3">
              <div className="flex flex-col items-center">
                <span className={`grid h-9 w-9 place-items-center rounded-full text-sm font-bold ${w.items.some(i => i.isCriticalPath) ? "bg-ink text-surface" : "bg-surface-2 text-ink-2"}`}>{w.afterOpening ? "✦" : w.index}</span>
                {k < waves.length - 1 && <span className="w-0.5 flex-1 bg-line" />}
              </div>
              <div className="grid gap-2.5 pb-6">
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 pt-1.5">
                  <h3 className="text-[15px] font-bold">{w.afterOpening ? "After you open" : w.startDay === 0 ? "Start now" : `From ~${fmtShort(addDays(start, w.startDay))}`}</h3>
                  <span className="text-xs text-ink-3">{w.items.length > 1 ? `${w.items.length} steps in parallel` : "1 step"}{!w.afterOpening ? ` · until ~${fmtShort(addDays(start, w.endDay))}` : ""}</span>
                </div>
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                  {w.items.map(i => (
                    <StepCard key={i.ruleId} i={i} n={num.get(i.ruleId)!} done={done.has(i.ruleId)} fresh={fresh.has(i.ruleId)}
                      dim={focusPhase !== "all" && i.phase !== focusPhase} onOpen={() => setOpen(i.ruleId)} onToggle={() => toggle(i.ruleId)}
                      waitsFor={i.dependsOn.map(d => byId.get(d)!.plainName)} />
                  ))}
                </div>
              </div>
            </li>
          ))}
          <li className="grid grid-cols-[36px_1fr] gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink" aria-hidden>★</span>
            <div className="pt-1.5"><div className="text-[15px] font-bold">Open for business · ~{fmtShort(plan.openDate.typical)}</div><div className="text-xs text-ink-3">Range {fmtShort(plan.openDate.fast)} – {fmtShort(plan.openDate.slow)}</div></div>
          </li>
        </ol>
      ) : (
        <Gantt plan={plan} previous={previous} onSelect={setOpen} done={done} bare />
      )}

      {item && <StepPanel item={item} n={num.get(item.ruleId)!} start={start} after={item.dependsOn.map(d => byId.get(d)!.plainName)}
        done={done.has(item.ruleId)} onToggleDone={() => toggle(item.ruleId)} onClose={() => setOpen(null)} />}
    </Section>
  );
}

function StepCard({ i, n, done, fresh, dim, onOpen, onToggle, waitsFor }: { i: PlanPermitItem; n: number; done: boolean; fresh: boolean; dim: boolean; onOpen: () => void; onToggle: () => void; waitsFor: string[] }) {
  const work = i.level === "work";
  const color = LEVEL_COLOR[i.level];
  const cost = i.fee.typical ? (i.fee.min === i.fee.max ? money(i.fee.typical) : `~${kmoney(i.fee.typical)}`) : work ? "—" : "Free";
  return (
    <div className={`relative flex overflow-hidden rounded-xl border bg-surface transition-all ${i.isCriticalPath ? "border-ink border-[1.5px]" : "border-line"} ${dim ? "opacity-40" : ""} ${done ? "opacity-60" : ""} ${fresh ? "fresh" : ""} hover:-translate-y-0.5 hover:shadow-md`}>
      <span className="w-1.5 flex-none" style={{ background: work ? "repeating-linear-gradient(45deg, var(--work) 0 3px, transparent 3px 6px)" : color }} />
      <button onClick={onOpen} className="grid flex-1 content-start gap-1.5 p-3 pr-9 text-left">
        <span className="flex items-center gap-2">
          <span className="grid h-8 w-8 flex-none place-items-center rounded-lg bg-surface-2 text-ink-2"><StepIcon id={i.ruleId} /></span>
          <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-3">{work ? "Your work" : LEVEL_LABEL[i.level]} · #{n}</span>
        </span>
        <span className={`font-semibold leading-snug ${done ? "line-through" : ""}`}>{i.plainName}</span>
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
          <span className="num">{i.durationDays.typical <= 1 ? "1 day" : `~${i.durationDays.typical} days`}</span>
          <span className="num">{cost}</span>
          {i.requiredDocs.length > 0 && <span>{i.requiredDocs.length} docs</span>}
        </span>
        <span className="flex flex-wrap gap-1">
          {i.isCriticalPath && <span className="tag bg-ink text-surface">Sets opening date</span>}
          {fresh && <span className="tag bg-accent text-accent-ink">New</span>}
          {!i.gatesOpening && i.phase !== "after_open" && <span className="tag bg-surface-2 text-ink-3">Can finish later</span>}
        </span>
        {waitsFor.length > 0 && <span className="text-[11px] text-ink-3">After: {waitsFor.slice(-2).join(", ")}{waitsFor.length > 2 ? ` +${waitsFor.length - 2}` : ""}</span>}
      </button>
      <button onClick={onToggle} aria-pressed={done} aria-label={done ? "Mark not done" : "Mark done"}
        className={`absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-full border-2 text-xs ${done ? "border-accent bg-accent text-accent-ink" : "border-line text-transparent hover:border-accent hover:text-accent"}`}>✓</button>
    </div>
  );
}
