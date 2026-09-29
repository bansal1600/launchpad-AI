"use client";
import { useEffect, useRef, useState } from "react";
import type { BusinessProfile, PlanDiff } from "@/lib/schemas";
import type { ChatEvent } from "@/lib/llm/chatAgent";
import { humanSummary } from "@/lib/engine/diff";
import { daysBetween, fmtShort, kmoney, spanText } from "@/lib/dates";
import StepIcon from "@/components/plan/StepIcon";

export type ChatMsg =
  | { role: "user" | "assistant" | "note"; text: string }
  | { role: "diff"; diff: PlanDiff; version: number; label: string }
  | { role: "trace"; steps: TraceStep[] };
export type TraceStep = { id: string; label: string; detail?: string; state: "active" | "done" | "error" };

type Props = {
  messages: ChatMsg[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMsg[]>>;
  profile: BusinessProfile;
  onUpdate: (p: BusinessProfile, label: string) => { diff: PlanDiff; version: number };
  onUndo: () => void;
  currentVersion: number;
};

export default function Chat({ messages, setMessages, profile, onUpdate, onUndo, currentVersion }: Props) {
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"anthropic" | "openai" | "local" | null>(null);
  const list = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages, busy]);

  // Streamed text goes into the last assistant bubble; an update closes it so later text starts a new one.
  // Decide "new bubble or append" when the event arrives, not inside the state updater, which React may run later.
  const appendText = (delta: string, fresh: { v: boolean; closedTrace: boolean }) => {
    const startNew = fresh.v;
    fresh.v = false;
    setMessages(ms => {
      const last = ms[ms.length - 1];
      if (!startNew && last?.role === "assistant") return [...ms.slice(0, -1), { role: "assistant", text: last.text + delta }];
      return [...ms, { role: "assistant", text: delta.trimStart() }];
    });
  };

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    const history = messages.filter((m): m is Extract<ChatMsg, { text: string }> => m.role === "user" || m.role === "assistant").map(m => ({ role: m.role as "user" | "assistant", text: m.text }));
    setMessages(ms => [...ms, { role: "user", text }]);
    setBusy(true);
    const fresh = { v: true, closedTrace: false };
    try {
      const res = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text, history, profile }) });
      if (!res.body) throw new Error("no body");
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const e = JSON.parse(line) as ChatEvent;
          if (e.type === "text") appendText(e.delta, fresh);
          else if (e.type === "mode") setMode(e.mode);
          else if (e.type === "status") {
            // Steps build up in one trace until text or a plan update closes it (decided now, not in the updater).
            const forceNew = fresh.closedTrace;
            fresh.closedTrace = false;
            setMessages(ms => {
              const last = ms[ms.length - 1];
              const step: TraceStep = { id: e.id, label: e.label, detail: e.detail, state: e.state };
              if (last?.role === "trace" && !forceNew) {
                const i = last.steps.findIndex(s => s.id === e.id);
                const steps = i >= 0 ? last.steps.map((s, k) => (k === i ? step : s)) : [...last.steps, step];
                return [...ms.slice(0, -1), { role: "trace", steps }];
              }
              return [...ms, { role: "trace", steps: [step] }];
            });
          }
          else if (e.type === "error") setMessages(ms => [...ms, { role: "note", text: e.message }]);
          else if (e.type === "update") {
            const { diff, version } = onUpdate(e.profile, e.label);
            setMessages(ms => [...ms, { role: "diff", diff, version, label: e.label }]);
            fresh.v = true;
            fresh.closedTrace = true;
          }
        }
      }
    } catch {
      setMessages(ms => [...ms, { role: "note", text: "Couldn't reach the server. Check your connection and try again." }]);
    } finally {
      setBusy(false);
      box.current?.focus();
    }
  }

  return (
    <aside id="chat" className="panel flex min-h-[560px] scroll-mt-4 flex-col lg:sticky lg:top-3 lg:h-[calc(100vh-24px)]" aria-label="Plan chat">
      <div className="border-b border-line px-4 py-3.5">
        <h2 className="text-lg font-bold">Tell me about your business</h2>
        <p className="text-xs text-ink-3">Chat normally. Anything you mention, like food, alcohol, the space, rent, budget or dates, updates the plan as we talk.</p>
        {mode === "local" && <p className="mt-2 text-xs text-ink-3">Offline mode: simple keyword matching. Add OPENAI_API_KEY or ANTHROPIC_API_KEY to web/.env.local and restart for the full assistant.</p>}
      </div>
      <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-3.5 max-lg:max-h-[480px]" aria-live="polite">
        {messages.map((m, i) => m.role === "trace" ? <Trace key={i} steps={m.steps} />
          : m.role === "diff"
          ? <DiffCard key={i} m={m} onUndo={onUndo} canUndo={m.version === currentVersion && currentVersion > 0} />
          : m.role === "note" ? <p key={i} className="self-center text-center text-xs text-ink-3">{m.text}</p>
          : <div key={i} className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[14px] ${m.role === "user" ? "self-end rounded-br-sm bg-accent text-accent-ink" : "self-start rounded-bl-sm bg-surface-2"}`}>{m.text}</div>)}
        {busy && !["assistant", "trace"].includes(messages[messages.length - 1]?.role ?? "") && <Typing />}
      </div>
      <form className="flex items-end gap-2 border-t border-line px-4 pb-3.5 pt-3" onSubmit={e => { e.preventDefault(); send(); }}>
        <textarea ref={box} rows={2} className="field max-h-40 flex-1 resize-none" value={input} disabled={busy}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          placeholder="e.g. It used to be a sandwich shop, about 1,500 sq ft, rent is $6,000" aria-label="Message" />
        <button className="btn btn-primary" disabled={busy || !input.trim()}>Send</button>
      </form>
    </aside>
  );
}

function Typing() {
  return <div className="self-start rounded-xl rounded-bl-sm bg-surface-2 px-3 py-2 text-ink-3" aria-label="Assistant is typing"><span className="animate-pulse">●●●</span></div>;
}

function Trace({ steps }: { steps: TraceStep[] }) {
  const running = steps.some(s => s.state === "active");
  return (
    <div className="self-stretch rounded-lg border border-line bg-bg px-3 py-2.5">
      <div className="mb-1.5 flex items-center gap-2 text-xs font-semibold text-ink-2">
        {running ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-accent border-t-transparent" /> : <span className="text-accent">✓</span>}
        {running ? "Updating your plan…" : "Plan rebuilt"}
      </div>
      <ol className="grid gap-1.5">
        {steps.map(s => (
          <li key={s.id} className="grid grid-cols-[16px_1fr] items-start gap-2 text-[12.5px]">
            <span className="mt-0.5 grid h-4 w-4 place-items-center">
              {s.state === "active" ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-ink-3 border-t-transparent" />
                : s.state === "error" ? <span className="text-crit">✕</span> : <span className="grid h-4 w-4 place-items-center rounded-full bg-accent text-[9px] text-accent-ink">✓</span>}
            </span>
            <span><span className={s.state === "active" ? "text-ink" : "text-ink-2"}>{s.label}</span>{s.detail && <span className="block text-ink-3">{s.detail}</span>}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function DiffCard({ m, onUndo, canUndo }: { m: Extract<ChatMsg, { role: "diff" }>; onUndo: () => void; canUndo: boolean }) {
  const d = m.diff;
  const s0 = d.planStart;
  const span = Math.max(daysBetween(s0, d.fromDate), daysBetween(s0, d.toDate), 1) * 1.08;
  const pos = (iso: string) => `${(daysBetween(s0, iso) / span) * 100}%`;
  const maxCost = Math.max(d.fromCost, d.toCost, 1) * 1.05;
  const nothing = !d.added.length && !d.removed.length && !d.openDeltaDays && !Math.round(d.costDelta) && !d.gained.length && !d.lost.length && !d.jurisdiction;
  return (
    <div className="grid gap-3 rounded-lg border border-line bg-surface p-3" title={humanSummary(d)}>
      <div className="flex items-center justify-between gap-2"><span className="eyebrow">Plan updated · v{m.version + 1}</span>{canUndo && <button className="btn !px-2 !py-0.5 text-xs" onClick={onUndo}>Undo</button>}</div>
      {nothing && <p className="text-[13px] text-ink-2">Noted. Your opening date and costs stay the same.</p>}
      {d.jurisdiction && <p className="text-[13px]">Now regulated by <strong>{d.jurisdiction.to}</strong> <span className="text-ink-3">(was {d.jurisdiction.from})</span></p>}

      {d.openDeltaDays !== 0 && d.planStart && (
        <div className="grid gap-1.5">
          <div className="flex justify-between text-[12px]"><span className="text-ink-2">Opening day</span><strong className={d.openDeltaDays > 0 ? "text-crit" : "text-good"}>{d.openDeltaDays > 0 ? "+" : "−"}{spanText(d.openDeltaDays)}</strong></div>
          <div className="relative h-7">
            <div className="absolute inset-x-0 top-3 h-1 rounded-full bg-surface-2" />
            <span className="absolute top-1.5 h-4 w-4 -translate-x-1/2 rounded-full border-2 border-ink-3 bg-surface" style={{ left: pos(d.fromDate) }} title={`Was ${fmtShort(d.fromDate)}`} />
            <span className="absolute top-1 h-5 w-5 -translate-x-1/2 rotate-45 rounded-[3px] bg-accent" style={{ left: pos(d.toDate) }} title={`Now ${fmtShort(d.toDate)}`} />
          </div>
          <div className="flex justify-between text-[11px] text-ink-3"><span>Today</span><span>{fmtShort(d.fromDate)} → <strong className="text-ink">{fmtShort(d.toDate)}</strong></span></div>
        </div>
      )}

      {Math.round(d.costDelta) !== 0 && d.fromCost != null && (
        <div className="grid gap-1">
          <div className="flex justify-between text-[12px]"><span className="text-ink-2">Startup cost</span><strong className={d.costDelta > 0 ? "text-crit" : "text-good"}>{d.costDelta > 0 ? "+" : "−"}{kmoney(Math.abs(d.costDelta))}</strong></div>
          {[["Before", d.fromCost, "var(--ink-3)"], ["Now", d.toCost, "var(--accent)"]].map(([l, v, c]) => (
            <div key={l as string} className="grid grid-cols-[44px_1fr_52px] items-center gap-2 text-[11px] text-ink-2">
              <span>{l}</span><span className="h-2.5 rounded-full" style={{ width: `${((v as number) / maxCost) * 100}%`, background: c as string }} /><span className="text-right num">{kmoney(v as number)}</span>
            </div>
          ))}
        </div>
      )}

      {(d.added.length > 0 || d.removed.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {d.added.map(i => <span key={i.ruleId} className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft px-2 py-1 text-[12px] text-accent"><StepIcon id={i.ruleId} className="h-3.5 w-3.5" />{i.plainName}</span>)}
          {d.removed.map(i => <span key={i.ruleId} className="inline-flex items-center gap-1.5 rounded-full border border-line px-2 py-1 text-[12px] text-ink-3 line-through"><StepIcon id={i.ruleId} className="h-3.5 w-3.5" />{i.plainName}</span>)}
        </div>
      )}
      {(d.gained.length > 0 || d.lost.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {d.gained.map(i => <span key={i.ruleId} className="rounded-full bg-good-soft px-2 py-1 text-[12px] text-good">★ May now qualify: {i.name}</span>)}
          {d.lost.map(i => <span key={i.ruleId} className="rounded-full bg-crit-soft px-2 py-1 text-[12px] text-crit">No longer eligible: {i.name}</span>)}
        </div>
      )}
    </div>
  );
}
