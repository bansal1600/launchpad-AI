"use client";
import { useEffect, useState } from "react";

/** One tooltip for a chart: any child with data-tip shows its text on hover. */
export function useTip() {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null);
  const handlers = {
    onPointerMove: (e: React.PointerEvent) => {
      const t = (e.target as Element).closest("[data-tip]");
      setTip(t ? { text: t.getAttribute("data-tip")!, x: e.clientX, y: e.clientY } : null);
    },
    onPointerLeave: () => setTip(null),
  };
  const node = tip && (
    <div role="tooltip" className="pointer-events-none fixed z-50 max-w-64 whitespace-pre-line rounded-md bg-ink px-2.5 py-1.5 text-xs text-surface shadow-lg"
      style={{ left: Math.min(tip.x + 14, (typeof window !== "undefined" ? window.innerWidth : 9999) - 270), top: tip.y + 14 }}>{tip.text}</div>
  );
  return { handlers, node };
}

export function useWidth<T extends HTMLElement>(ref: React.RefObject<T | null>, fallback = 700) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.round(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}
