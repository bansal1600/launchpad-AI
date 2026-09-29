"use client";
import { useState } from "react";
import type { BusinessType } from "@/lib/schemas";
import { completeProfile, VALUE_LABELS } from "@/lib/defaults";
import type { BusinessProfile } from "@/lib/schemas";
import { resolveAddress, Logo } from "@/components/layout/App";

const TYPES: { t: BusinessType; hint: string }[] = [
  { t: "cafe", hint: "Coffee, tea, bakery, boba" },
  { t: "restaurant", hint: "Sit-down or counter service" },
  { t: "retail_boutique", hint: "Clothing, gifts, goods" },
];

export default function Intake({ onDone }: { onDone: (p: BusinessProfile) => void }) {
  const [type, setType] = useState<BusinessType | null>(null);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!type) { setError("Pick what you're opening."); return; }
    if (!address.trim()) { setError("Add the street address of the space you're looking at."); return; }
    setBusy(true);
    const r = await resolveAddress(completeProfile({ businessType: type, address: { raw: address.trim() } })).catch(() => ({ error: "Couldn't reach the address lookup. Check your connection and try again." }));
    if ("error" in r) { setError(r.error); setBusy(false); return; }
    onDone(r);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12 sm:py-20">
      <div className="mb-10 flex items-center gap-2.5"><Logo /><span className="font-display text-lg font-bold">Comply Cofounder</span></div>
      <h1 className="mb-3 text-4xl font-bold leading-[1.05] sm:text-5xl">Know before you sign the lease.</h1>
      <p className="mb-8 max-w-[60ch] text-base text-ink-2">Two answers get you a full plan: every permit in order, a realistic opening date, a startup budget, nearby competitors and grants. Then just chat to fill in the rest.</p>

      <form onSubmit={submit} className="panel grid gap-5 p-5">
        <fieldset className="grid gap-2">
          <legend className="mb-2 font-medium">What are you opening?</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {TYPES.map(({ t, hint }) => (
              <button type="button" key={t} aria-pressed={type === t} onClick={() => setType(t)}
                className={`rounded-lg border p-3 text-left transition-colors ${type === t ? "border-accent bg-accent-soft" : "border-line bg-bg hover:border-ink-3"}`}>
                <span className="block font-semibold">{VALUE_LABELS.businessType[t]}</span>
                <span className="text-xs text-ink-2">{hint}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <div className="grid gap-1.5">
          <label htmlFor="addr" className="font-medium">Where?</label>
          <input id="addr" className="field text-base" value={address} onChange={e => setAddress(e.target.value)} placeholder="87 N San Pedro St, San Jose, CA" autoComplete="street-address" />
        </div>
        {error && <p role="alert" className="text-sm text-crit">{error}</p>}
        <button className="btn btn-primary justify-self-start px-5 py-2.5 text-base" disabled={busy}>{busy ? "Building your plan…" : "Build my plan"}</button>
      </form>
      <p className="mt-10 text-xs text-ink-3">Covers San José today, with county and state steps anywhere in Santa Clara County. Guidance, not legal advice.</p>
    </main>
  );
}
