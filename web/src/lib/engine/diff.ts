import type { Plan, PlanDiff } from "@/lib/schemas";
import { kmoney, spanText } from "@/lib/dates";

const permits = (p: Plan) => p.items.filter(i => i.level !== "work");
const key = (i: { ruleId: string }) => i.ruleId;
const counts = (m: string) => m !== "not_eligible";

export function diffPlans(a: Plan, b: Plan): PlanDiff {
  const aIds = new Set(permits(a).map(key)), bIds = new Set(permits(b).map(key));
  const aInc = new Map(a.incentives.map(i => [i.ruleId, i.match])), bInc = new Map(b.incentives.map(i => [i.ruleId, i.match]));
  const ja = placeName(a), jb = placeName(b);
  return {
    added: permits(b).filter(i => !aIds.has(i.ruleId)),
    removed: permits(a).filter(i => !bIds.has(i.ruleId)),
    openDeltaDays: b.days.typical - a.days.typical,
    fromDate: a.openDate.typical,
    toDate: b.openDate.typical,
    costDelta: b.costs.total.typical - a.costs.total.typical,
    fromCost: a.costs.total.typical, toCost: b.costs.total.typical, planStart: b.profile.planStartDate,
    gained: b.incentives.filter(i => counts(i.match) && !counts(aInc.get(i.ruleId) ?? "not_eligible")),
    lost: a.incentives.filter(i => counts(i.match) && !counts(bInc.get(i.ruleId) ?? "not_eligible")),
    jurisdiction: ja !== jb ? { from: ja, to: jb } : undefined,
  };
}

export const placeName = (p: Plan) => {
  const j = p.profile.jurisdiction;
  if (!j) return "Unknown";
  if (j.kind === "unincorporated") return "Unincorporated Santa Clara County";
  if (j.kind === "out_of_area") return j.cityName ? `${j.cityName} (outside Santa Clara County)` : "Outside Santa Clara County";
  return j.cityName ?? "Unknown";
};

/** Deterministic one-line summary; numbers always come from the diff, never from the LLM. */
export function humanSummary(d: PlanDiff): string {
  const parts: string[] = [];
  if (d.added.length) parts.push(`+${d.added.length} permit${d.added.length > 1 ? "s" : ""} (${d.added.map(i => i.plainName).join(", ")})`);
  if (d.removed.length) parts.push(`−${d.removed.length} permit${d.removed.length > 1 ? "s" : ""}`);
  parts.push(d.openDeltaDays ? `Opening ${d.openDeltaDays > 0 ? "+" : "−"}${spanText(d.openDeltaDays)}` : "Opening unchanged");
  if (Math.round(d.costDelta)) parts.push(`${d.costDelta > 0 ? "+" : "−"}${kmoney(Math.abs(d.costDelta))} typical`);
  parts.push(d.gained.length || d.lost.length ? `Incentives: ${[...d.gained.map(i => "+" + i.name), ...d.lost.map(i => "−" + i.name)].join(", ")}` : "No change to incentives");
  return parts.join(" · ");
}
