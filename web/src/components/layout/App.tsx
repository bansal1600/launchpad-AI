"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { BusinessProfile, Plan, PlanDiff } from "@/lib/schemas";
import { buildPlan } from "@/lib/engine/buildPlan";
import { diffPlans } from "@/lib/engine/diff";
import { VALUE_LABELS } from "@/lib/defaults";
import { nextQuestion } from "@/lib/nextQuestion";
import Intake from "@/components/layout/Intake";
import PlanView from "@/components/plan/PlanView";
import Chat, { type ChatMsg } from "@/components/chat/Chat";

export type Version = { profile: BusinessProfile; plan: Plan; label: string; diff?: PlanDiff };
type Saved = { versions: { profile: BusinessProfile; label: string }[]; cur: number; messages: ChatMsg[] };
const KEY = "comply-cofounder:v2";

export async function resolveAddress(profile: BusinessProfile): Promise<BusinessProfile | { error: string }> {
  const res = await fetch("/api/geocode", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ address: profile.address.raw }) });
  const g = await res.json();
  if (!g.ok) return { error: g.error };
  return { ...profile, address: { raw: profile.address.raw, normalized: g.normalized, lat: g.lat, lng: g.lng }, jurisdiction: g.jurisdiction };
}

export default function App() {
  const [versions, setVersions] = useState<Version[]>([]);
  const [cur, setCur] = useState(0);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Chat updates arrive mid-stream; this ref lets each one build on the latest version.
  const state = useRef({ versions, cur });
  useEffect(() => { state.current = { versions, cur }; }, [versions, cur]);

  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Saved | null;
      if (s?.versions?.length) {
        const vs: Version[] = s.versions.map(v => ({ ...v, plan: buildPlan(v.profile) }));
        vs.forEach((v, i) => { if (i) v.diff = diffPlans(vs[i - 1].plan, v.plan); });
        // localStorage only exists after hydration, so this restore has to run in an effect.
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setVersions(vs); setCur(Math.min(s.cur, vs.length - 1)); setMessages(s.messages ?? []);
      }
    } catch { /* ignore corrupt storage */ }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ versions: versions.map(v => ({ profile: v.profile, label: v.label })), cur, messages: messages.slice(-80) } satisfies Saved));
    } catch { /* storage full or blocked */ }
  }, [versions, cur, messages, loaded]);

  /** A new profile from the chat becomes a new plan version immediately. */
  const commit = useCallback((profile: BusinessProfile, label: string): { diff: PlanDiff; version: number } => {
    const { versions: vs, cur: c } = state.current;
    const plan = buildPlan(profile);
    const diff = diffPlans(vs[c].plan, plan);
    const next = [...vs.slice(0, c + 1), { profile, plan, label, diff }];
    state.current = { versions: next, cur: c + 1 };
    setVersions(next); setCur(c + 1);
    return { diff, version: c + 1 };
  }, []);

  const start = (profile: BusinessProfile) => {
    const plan = buildPlan(profile);
    setVersions([{ profile, plan, label: "First plan" }]);
    setCur(0);
    const type = VALUE_LABELS.businessType[profile.businessType].toLowerCase();
    const q = nextQuestion(profile);
    setMessages([{ role: "assistant", text: `Here's a first plan for a ${type} at ${profile.address.normalized ?? profile.address.raw}. I used typical values for everything else, so tell me about your business and I'll update it as we go. ${q ?? ""}`.trim() }]);
  };
  const undo = () => { if (cur > 0) { setMessages(m => [...m, { role: "note", text: `Undid “${versions[cur].label}”.` }]); setCur(cur - 1); } };
  const reset = () => { setVersions([]); setMessages([]); setCur(0); };

  if (!loaded) return null;
  const current = versions[cur];
  if (!current) return <Intake onDone={start} />;

  return (
    <div className="mx-auto max-w-[1640px] px-4 pb-10">
      <header className="mb-5 flex flex-wrap items-center gap-3 border-b border-line py-3">
        <div className="mr-auto flex items-center gap-2.5">
          <Logo />
          <div>
            <div className="font-display text-xl font-bold leading-tight">Comply Cofounder</div>
            <div className="text-xs text-ink-2">Know before you sign the lease.</div>
          </div>
        </div>
        <label htmlFor="ver" className="eyebrow">Version</label>
        <select id="ver" className="field !w-auto max-w-64" value={cur} onChange={e => setCur(+e.target.value)}>
          {versions.map((v, i) => <option key={i} value={i}>v{i + 1} · {v.label}</option>)}
        </select>
        <button className="btn" onClick={undo} disabled={cur === 0}>Undo</button>
        <button className="btn" onClick={reset}>New plan</button>
      </header>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        <PlanView plan={current.plan} previous={versions[cur - 1]?.plan} diff={current.diff} />
        <Chat messages={messages} setMessages={setMessages} profile={current.profile} onUpdate={commit} onUndo={undo} currentVersion={cur} />
      </div>

      <a href="#chat" className="btn btn-primary fixed bottom-4 right-4 z-50 shadow-lg lg:hidden" style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}>Chat</a>
      <footer className="mt-8 grid max-w-[90ch] gap-1 text-xs text-ink-3">
        <p>This plan is guidance based on public government sources, each linked. Requirements change and depend on your specific situation. Confirm with the issuing agency before acting. This is not legal advice.</p>
      </footer>
    </div>
  );
}

export function Logo() {
  return (
    <svg width="32" height="32" viewBox="0 0 34 34" aria-hidden="true">
      <rect x="1.5" y="1.5" width="31" height="31" rx="8" fill="none" stroke="var(--accent)" strokeWidth="2" />
      <path d="M9 18.5l5 5 11-12" fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
