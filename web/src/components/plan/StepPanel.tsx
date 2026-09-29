"use client";
import { useEffect, useState } from "react";
import type { PlanPermitItem } from "@/lib/schemas";
import { addDays, fmtShort, money } from "@/lib/dates";
import { helpersFor, type Helper } from "@/data/helpers";
import { LEVEL_COLOR, LEVEL_LABEL, Swatch } from "@/components/plan/PlanView";
import StepIcon from "@/components/plan/StepIcon";

type Tab = "steps" | "docs" | "help";
const docsKey = (id: string) => `comply-cofounder:docs:${id}`;

export default function StepPanel({ item, n, start, after, done, onToggleDone, onClose }: { item: PlanPermitItem; n: number; start: string; after: string[]; done: boolean; onToggleDone: () => void; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("steps");
  const [have, setHave] = useState<string[]>(() => { try { return JSON.parse(localStorage.getItem(docsKey(item.ruleId)) ?? "[]"); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(docsKey(item.ruleId), JSON.stringify(have)); } catch { /* ignore */ } }, [have, item.ruleId]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc); return () => removeEventListener("keydown", esc);
  }, [onClose]);
  const { free, vendors } = helpersFor(item.ruleId);
  const work = item.level === "work";
  const cost = item.fee.max ? (item.fee.min === item.fee.max ? money(item.fee.min) : `${money(item.fee.min)}–${money(item.fee.max)}`) : "Free";
  const tabs: [Tab, string][] = [["steps", "Steps"], ["docs", `Documents (${have.filter(d => item.requiredDocs.includes(d)).length}/${item.requiredDocs.length})`], ["help", "Who can help"]];

  return (
    <div className="fixed inset-0 z-[1000] flex justify-end bg-black/30" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={item.plainName} className="flex h-full w-full max-w-xl flex-col bg-surface shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="grid gap-3 border-b border-line p-5">
          <div className="flex items-start justify-between gap-3">
            <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-accent-soft text-accent"><StepIcon id={item.ruleId} /></span>
            <div className="mr-auto">
              <div className="eyebrow">Step {n}{item.isCriticalPath ? " · sets your opening date" : ""}</div>
              <h2 className="text-xl font-bold">{item.plainName}</h2>
              {!work && <div className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3"><Swatch c={LEVEL_COLOR[item.level]} />{LEVEL_LABEL[item.level]} · {item.agency}</div>}
            </div>
            <button className="btn" onClick={onClose} autoFocus>Close</button>
          </div>
          <div>
            <button onClick={onToggleDone} aria-pressed={done} className={`btn ${done ? "btn-primary" : ""}`}>{done ? "✓ Done" : "Mark as done"}</button>
          </div>
          <p className="text-[14px] text-ink-2">{item.shortDescription}</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Fact label="Time" value={item.durationDays.typical <= 1 ? "1 day" : `~${item.durationDays.typical} days`} sub={`${item.durationDays.min}–${item.durationDays.max} days`} />
            <Fact label="Cost" value={cost} sub={item.fee.max ? "fees" : ""} />
            <Fact label="When" value={item.startDay === 0 ? "Now" : fmtShort(addDays(start, item.startDay))} sub={`done ~${fmtShort(addDays(start, item.endDay))}`} />
          </div>
          <div className="flex gap-1" role="tablist">
            {tabs.map(([t, l]) => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-[13px] font-medium ${tab === t ? "bg-ink text-surface" : "text-ink-2 hover:bg-surface-2"}`}>{l}</button>)}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 text-[14px]">
          {tab === "steps" && (
            <div className="grid gap-4">
              <ol className="grid gap-3">
                {item.whatToDo.map((t, i) => (
                  <li key={t} className="grid grid-cols-[26px_1fr] gap-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent">{i + 1}</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ol>
              {item.warnings.length > 0 && <div className="grid gap-1.5 rounded-lg bg-surface-2 p-3 text-[13px]"><span className="eyebrow">Good to know</span>{item.warnings.map(w => <p key={w}>{w}</p>)}</div>}
              {after.length > 0 && <p className="text-[13px] text-ink-2"><strong className="text-ink">Do these first:</strong> {after.join("; ")}</p>}
              {item.office ? (
                <div className="grid gap-1 rounded-lg border border-line p-3 text-[13px]">
                  <span className="eyebrow">Where to go</span>
                  <span className="font-semibold">{item.office.name}</span>
                  <span className="text-ink-2">{item.office.address}</span>
                  <span className="text-ink-2">{item.office.hours}</span>
                  {item.office.phone && <span className="select-all font-mono text-ink-2">{item.office.phone}</span>}
                </div>
              ) : item.contact && <p className="text-[13px] text-ink-2"><strong className="text-ink">Where:</strong> {item.contact}</p>}
              {item.links.length > 0 && (
                <div className="grid gap-1.5">
                  <span className="eyebrow">Official links</span>
                  {item.links.map(l => <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[13px] hover:border-accent hover:bg-accent-soft/40"><span>{l.label}</span><span className="text-accent">↗</span></a>)}
                </div>
              )}
              {item.feeNote && <p className="text-[13px] text-ink-2"><strong className="text-ink">About the cost:</strong> {item.feeNote}</p>}
              {item.sourceUrl && !item.links.length && <a className="text-[13px] text-accent underline" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">Official page ↗</a>}
              {item.verified && item.level !== "work" && <p className="text-xs text-ink-3">Checked against the official source in Sep 2026.</p>}
            </div>
          )}

          {tab === "docs" && (
            <div className="grid gap-3">
              <p className="text-[13px] text-ink-2">Gather these before you apply. Check them off as you go; your progress stays on this device.</p>
              {item.requiredDocs.length ? (
                <ul className="grid gap-2">
                  {item.requiredDocs.map(d => (
                    <li key={d}>
                      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-line p-3 hover:bg-bg">
                        <input type="checkbox" className="h-4 w-4 accent-[var(--accent)]" checked={have.includes(d)} onChange={e => setHave(h => e.target.checked ? [...h, d] : h.filter(x => x !== d))} />
                        <span className={have.includes(d) ? "text-ink-3 line-through" : ""}>{d}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-ink-3">No documents needed for this step.</p>}
            </div>
          )}

          {tab === "help" && (
            <div className="grid gap-5">
              {free.length > 0 && <HelperGroup title="Free help" items={free} />}
              {vendors.length > 0 && <HelperGroup title="Local pros (sample listings)" items={vendors} />}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, sub }: { label: string; value: string; sub: string }) {
  return <div className="rounded-lg bg-surface-2 px-2 py-2"><div className="eyebrow">{label}</div><div className="font-semibold num">{value}</div><div className="text-[11px] text-ink-3">{sub}</div></div>;
}

function HelperGroup({ title, items }: { title: string; items: Helper[] }) {
  return (
    <div className="grid gap-2">
      <div className="eyebrow">{title}</div>
      {items.map(h => (
        <div key={h.name} className="grid grid-cols-[40px_1fr_auto] items-start gap-3 rounded-lg border border-line p-3">
          <span className={`grid h-10 w-10 place-items-center rounded-full text-sm font-bold ${h.kind === "free" ? "bg-accent-soft text-accent" : "bg-surface-2 text-ink-2"}`}>{h.name.split(" ").slice(0, 2).map(w => w[0]).join("")}</span>
          <div className="min-w-0">
            <div className="font-semibold">{h.name}</div>
            <div className="text-xs text-ink-3">{h.role}{h.distance ? ` · ${h.distance}` : ""}</div>
            <p className="mt-1 text-[13px] text-ink-2">{h.note}</p>
            {h.rating && <div className="mt-1 text-xs text-ink-2"><span className="text-[#c98500]">{"★".repeat(Math.round(h.rating))}</span> {h.rating} ({h.reviews} reviews)</div>}
          </div>
          <div className="grid justify-items-end gap-1 text-right text-xs">
            {h.kind === "free" ? <span className="pill bg-good-soft text-good">Free</span> : <span className="font-medium text-ink">{h.price}</span>}
            {h.phone && <span className="select-all font-mono text-ink-2">{h.phone}</span>}
            {h.url && <a className="text-accent underline" href={h.url} target="_blank" rel="noopener noreferrer">Website ↗</a>}
          </div>
        </div>
      ))}
    </div>
  );
}
