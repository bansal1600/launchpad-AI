// Plan = f(profile, rules). Pure and deterministic: same profile in, same plan out.
import jsonLogic from "json-logic-js";
import permitsJson from "@/rules/permits.json";
import costsJson from "@/rules/costs.json";
import incentivesJson from "@/rules/incentives.json";
import type {
  BusinessProfile, CostLine, CostRule, IncentiveMatch, IncentiveRule, JsonLogic, Plan, PlanPermitItem, PermitRule, Range,
} from "@/lib/schemas";
import { addDays } from "@/lib/dates";

const PERMITS = permitsJson as unknown as PermitRule[];
const COSTS = costsJson as unknown as CostRule[];
const INCENTIVES = incentivesJson as unknown as IncentiveRule[];

/** Cities whose local rules are loaded. Keep in sync with geocode.ts. */
export const SUPPORTED_CITIES = ["san_jose", "sunnyvale"];

export const bldgNeeded = (p: BusinessProfile) =>
  p.acquisition === "new_buildout" || (p.acquisition === "second_generation" && p.foodService === "prepared_food");

/** Rule ids apply when any of their jurisdiction tags is in this list. */
export function jurisdictionTags(p: BusinessProfile): string[] {
  const j = p.jurisdiction;
  if (!j || j.kind === "out_of_area") return ["ca"];
  if (j.kind === "unincorporated") return ["ca", "scc", "unincorporated_scc"];
  return j.cityId && SUPPORTED_CITIES.includes(j.cityId) ? ["ca", "scc", j.cityId] : ["ca", "scc"];
}

/** Flat data object that json-logic rules read. */
export function ruleContext(p: BusinessProfile, extra: Record<string, unknown> = {}) {
  return {
    ...p,
    bldgNeeded: bldgNeeded(p),
    employees: p.employeesPlanned ?? 0,
    exteriorSign: !!p.exteriorSign,
    outdoorSeating: !!p.outdoorSeating,
    groundFloor: !!p.groundFloor,
    vacantMonths: p.storefrontVacantMonths ?? null,
    // San José Streamlined Restaurant Program: food businesses, tenant space generally 3,000 sq ft or less
    srpEligible: p.foodService === "prepared_food" && (p.squareFeet ?? 1200) <= 3000,
    ...extra,
  };
}

const applies = (logic: JsonLogic, ctx: object) => !!jsonLogic.apply(logic as never, ctx as never);
const sizeFactor = (p: BusinessProfile) => Math.min(1.6, Math.max(0.7, (p.squareFeet ?? 1200) / 1500));
const scale = (r: Range, f: number): Range => ({ min: Math.round(r.min * f), typical: Math.round(r.typical * f), max: Math.round(r.max * f) });

function placeholder(p: BusinessProfile): PermitRule | null {
  const j = p.jurisdiction;
  if (!j || j.supported) return null;
  const where = j.kind === "out_of_area" ? "Local and county" : `${j.cityName ?? "City"}`;
  return {
    id: "local_placeholder", name: `${where} permits (rules not loaded yet)`, plainName: `Get your ${where} permits`, phase: "build",
    whatToDo: ["Call the city's permit center. Ask what you need for a business license, zoning and any construction."],
    shortDescription: "Business license, zoning and building permits for this location. We don't have its rules yet, so this row is a rough estimate.",
    agency: j.cityName ?? "Local government", level: "city", jurisdictions: ["ca"], appliesWhen: true, dependsOn: [],
    durationDays: { min: 45, typical: 90, max: 150 }, feeUsd: { min: 500, typical: 2500, max: 7000 },
    howToApply: "Contact the city's permit center. Ask about business license, zoning clearance and building permits.",
    requiredDocs: [], sourceUrl: "https://www.calgold.ca.gov/", lastVerified: "", verified: false,
    warnings: ["Placeholder estimate. Real rules for this city aren't loaded yet."],
  };
}

type Sched = Record<string, { start: number; end: number }>;
function schedule(items: PlanPermitItem[], key: keyof Range): Sched {
  const byId = new Map(items.map(i => [i.ruleId, i]));
  const memo: Sched = {};
  const visit = (id: string, stack: Set<string>): { start: number; end: number } => {
    if (memo[id]) return memo[id];
    if (stack.has(id)) throw new Error(`Dependency cycle at ${id}`);
    stack.add(id);
    const it = byId.get(id)!;
    const start = Math.max(0, ...it.dependsOn.map(d => visit(d, stack).end));
    stack.delete(id);
    return (memo[id] = { start, end: start + it.durationDays[key] });
  };
  items.forEach(i => visit(i.ruleId, new Set()));
  return memo;
}

function perPersonFee(f: NonNullable<PermitRule["feePerPerson"]>, people: number): Range {
  const v = Math.round(f.base + Math.max(0, people - f.included) * f.perPerson);
  return { min: v, typical: v, max: v };
}

export function selectPermits(p: BusinessProfile): PlanPermitItem[] {
  const tags = jurisdictionTags(p);
  const ctx = ruleContext(p);
  const f = sizeFactor(p);
  const rules = PERMITS.filter(r => r.jurisdictions.some(t => tags.includes(t)) && applies(r.appliesWhen, ctx));
  const ph = placeholder(p);
  if (ph) rules.push(ph);
  const ids = new Set(rules.map(r => r.id));
  const people = (p.employeesPlanned ?? 0) + 1; // the owner counts
  return rules.map(r => ({
    ruleId: r.id, name: r.name, plainName: r.plainName, phase: r.phase, whatToDo: r.whatToDo, contact: r.contact, office: r.office, links: r.links ?? [], feeNote: r.feeNote, shortDescription: r.shortDescription, agency: r.agency,
    level: r.kind === "work" ? "work" : r.level,
    startDay: 0, endDay: 0, slowEndDay: 0,
    durationDays: r.scaleBySqft ? scale(r.durationDays, r.kind === "work" ? f : Math.sqrt(f)) : r.durationDays,
    fee: r.feePerPerson ? perPersonFee(r.feePerPerson, people) : r.scaleBySqft ? scale(r.feeUsd, f) : r.feeUsd,
    dependsOn: r.dependsOn.filter(d => ids.has(d)),
    isCriticalPath: false, gatesOpening: r.gatesOpening !== false,
    howToApply: r.howToApply, requiredDocs: r.requiredDocs, sourceUrl: r.sourceUrl, verified: r.verified, warnings: r.warnings ?? [],
  }));
}

export function estimateCosts(p: BusinessProfile, items: PlanPermitItem[], days: Plan["days"]): Plan["costs"] {
  const ctx = ruleContext(p);
  const rent = p.monthlyRentUsd ?? 0;
  const sq = p.squareFeet ?? 1200;
  const seats = p.seats ?? 0;
  const lines: CostLine[] = [];
  let pct: CostRule | undefined;
  for (const r of COSTS) {
    if (!applies(r.appliesWhen, ctx)) continue;
    const a = r.amount;
    let v: [number, number, number];
    switch (r.formula) {
      case "fixed": v = [a.low, a.typical, a.high]; break;
      case "per_sqft": v = [a.low * sq, a.typical * sq, a.high * sq]; break;
      case "per_seat": v = [a.low * seats, a.typical * seats, a.high * seats]; break;
      case "months_of_rent": v = [a.low * rent, a.typical * rent, a.high * rent]; break;
      case "permit_fees": v = [sum(items, i => i.fee.min), sum(items, i => i.fee.typical), sum(items, i => i.fee.max)]; break;
      case "rent_until_open": v = [(rent * days.min) / 30.4, (rent * days.typical) / 30.4, (rent * days.max) / 30.4]; break;
      case "percent_of_subtotal": pct = r; continue;
    }
    lines.push({ ruleId: r.id, category: r.category, label: r.id.startsWith("buildout_") ? `Buildout (${sq.toLocaleString()} sq ft × $${a.typical}/sq ft)` : r.label,
      low: Math.round(v[0]), typical: Math.round(v[1]), high: Math.round(v[2]), verified: r.verified });
  }
  const sub = { low: sum(lines, l => l.low), typical: sum(lines, l => l.typical), high: sum(lines, l => l.high) };
  if (pct) {
    const k = pct.amount.typical / 100;
    lines.push({ ruleId: pct.id, category: pct.category, label: pct.label, low: Math.round(sub.low * k), typical: Math.round(sub.typical * k), high: Math.round(sub.high * k), verified: pct.verified });
  }
  return { lines, total: { low: sum(lines, l => l.low), typical: sum(lines, l => l.typical), high: sum(lines, l => l.high) }, monthlyRent: rent };
}

export function matchIncentives(p: BusinessProfile, costTypical: number): IncentiveMatch[] {
  const tags = jurisdictionTags(p);
  const ctx = ruleContext(p, { overBudget: !!p.budgetUsd && costTypical > p.budgetUsd });
  return INCENTIVES.map(r => {
    const base = { ruleId: r.id, name: r.name, provider: r.provider, valueDescription: r.valueDescription, requirements: r.requirements,
      sourceUrl: r.sourceUrl, verified: r.verified, status: r.status };
    if (!r.jurisdictions.some(t => tags.includes(t)))
      return { ...base, match: "not_eligible" as const, reason: "Only for businesses in San José." };
    if (applies(r.eligibleWhen, ctx)) return { ...base, match: "eligible" as const, reason: r.eligibleReason };
    if (r.likelyEligibleWhen && applies(r.likelyEligibleWhen, ctx))
      return { ...base, match: "may_qualify" as const, reason: r.likelyReason ?? "", missingQuestion: r.missingQuestion };
    return { ...base, match: "not_eligible" as const, reason: notEligibleReason(r.id, p) };
  });
}

function notEligibleReason(id: string, p: BusinessProfile) {
  if (id === "sj_vacant_storefront") return p.groundFloor ? `The space has been vacant ${p.storefrontVacantMonths} months; the program targets 6+.` : "Only ground-floor storefronts qualify.";
  if (id === "sba_microloan") return p.budgetUsd ? "Your budget covers the typical estimate." : "Add a budget to check whether you'll need financing.";
  if (id === "kitchen_equipment_rebates") return "No new commercial kitchen equipment in this plan.";
  return "Doesn't match this profile.";
}

const sum = <T,>(xs: T[], f: (x: T) => number) => xs.reduce((s, x) => s + f(x), 0);

export function buildPlan(p: BusinessProfile): Plan {
  const items = selectPermits(p);
  const typ = schedule(items, "typical"), fast = schedule(items, "min"), slow = schedule(items, "max");
  for (const i of items) {
    i.startDay = typ[i.ruleId].start;
    i.endDay = typ[i.ruleId].end;
    i.slowEndDay = i.startDay + i.durationDays.max;
  }
  const gating = items.filter(i => i.gatesOpening);
  const days = {
    min: Math.max(0, ...gating.map(i => fast[i.ruleId].end)),
    typical: Math.max(0, ...gating.map(i => i.endDay)),
    max: Math.max(0, ...gating.map(i => slow[i.ruleId].end)),
  };
  // Critical path: walk back from the last gating item through the dependency that finished last.
  const byId = new Map(items.map(i => [i.ruleId, i]));
  let cur: PlanPermitItem | undefined = gating.reduce<PlanPermitItem | undefined>((a, b) => (!a || b.endDay > a.endDay ? b : a), undefined);
  while (cur) {
    cur.isCriticalPath = true;
    const c: PlanPermitItem = cur;
    cur = c.startDay === 0 ? undefined
      : c.dependsOn.map(d => byId.get(d)!).filter(d => d.endDay === c.startDay).sort((a, b) => b.durationDays.typical - a.durationDays.typical)[0];
  }
  items.sort((a, b) => a.startDay - b.startDay || a.endDay - b.endDay || a.ruleId.localeCompare(b.ruleId));
  const costs = estimateCosts(p, items, days);
  const start = p.planStartDate;
  return {
    profile: p, items, days,
    openDate: { fast: addDays(start, days.min), typical: addDays(start, days.typical), slow: addDays(start, days.max) },
    costs, incentives: matchIncentives(p, costs.total.typical),
  };
}
