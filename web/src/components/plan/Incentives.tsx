"use client";
import type { Plan, PlanDiff } from "@/lib/schemas";
import { Section } from "@/components/plan/PlanView";

export default function Incentives({ plan, diff }: { plan: Plan; diff?: PlanDiff }) {
  const gained = new Set(diff?.gained.map(i => i.ruleId));
  const yes = plan.incentives.filter(i => i.match !== "not_eligible"), no = plan.incentives.filter(i => i.match === "not_eligible");
  return (
    <Section title="Money and help you may qualify for">
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
        {yes.map(i => (
          <article key={i.ruleId} className="grid content-start gap-2 rounded-lg border border-line bg-bg p-4">
            <div className="flex flex-wrap gap-1.5">
              <span className={`pill ${i.match === "eligible" ? "bg-good-soft text-good" : "bg-accent-soft text-accent"}`}>{i.match === "eligible" ? "✓ Likely eligible" : "? May qualify"}</span>
              {gained.has(i.ruleId) && <span className="tag bg-accent text-accent-ink">New</span>}
            </div>
            <h3 className="text-[15px] font-bold">{i.name}</h3>
            <div className="text-xs text-ink-3">{i.provider}</div>
            <p>{i.valueDescription}</p>
            <p className="text-[12.5px] text-ink-2"><strong className="text-ink">Why:</strong> {i.reason}</p>
             {i.missingQuestion && <p className="rounded-md bg-surface-2 px-2.5 py-2 text-[13px]">{i.missingQuestion.question} <span className="text-ink-3">Answer in the chat.</span></p>}
            <ul className="list-disc pl-4 text-[12.5px] text-ink-2">{i.requirements.map(r => <li key={r}>{r}</li>)}</ul>
            <a className="text-[13px] text-accent underline" href={i.sourceUrl} target="_blank" rel="noopener noreferrer">Details ↗</a>
          </article>
        ))}
        {!yes.length && <p className="text-ink-2">No programs match this profile right now.</p>}
      </div>
      {no.length > 0 && (
        <details className="text-[13px]"><summary className="cursor-pointer text-ink-2">Checked, not a match ({no.length})</summary>
          <ul className="mt-2 list-disc pl-5 text-ink-2">{no.map(i => <li key={i.ruleId}><strong>{i.name}:</strong> {i.reason}</li>)}</ul>
        </details>
      )}
    </Section>
  );
}
