import type { Plan, PlanPermitItem } from "@/lib/schemas";

export type Wave = { index: number; startDay: number; endDay: number; items: PlanPermitItem[]; afterOpening: boolean };

/**
 * Group steps into waves by when they actually start: a wave is every step that can begin within the
 * same week, so they can be worked on side by side. Waves are in date order, so a step's prerequisites
 * are always in the same wave (short ones, like getting an EIN the day before) or an earlier one.
 * Steps that happen after opening day go in their own final wave.
 */
export function buildWaves(plan: Plan): Wave[] {
  const before = plan.items.filter(i => i.phase !== "after_open").sort((a, b) => a.startDay - b.startDay || Number(b.isCriticalPath) - Number(a.isCriticalPath));
  const after = plan.items.filter(i => i.phase === "after_open");
  const waves: Wave[] = [];
  for (const i of before) {
    const w = waves[waves.length - 1];
    if (w && i.startDay <= w.startDay + 6) { w.items.push(i); w.endDay = Math.max(w.endDay, i.endDay); }
    else waves.push({ index: waves.length + 1, startDay: i.startDay, endDay: i.endDay, items: [i], afterOpening: false });
  }
  for (const w of waves) w.items.sort((a, b) => Number(b.isCriticalPath) - Number(a.isCriticalPath) || a.startDay - b.startDay);
  if (after.length) waves.push({ index: waves.length + 1, startDay: plan.days.typical, endDay: plan.days.typical + Math.max(...after.map(i => i.durationDays.typical)), items: after, afterOpening: true });
  return waves;
}
