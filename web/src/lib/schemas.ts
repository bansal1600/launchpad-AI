// Shared contract. Mirrors 00_shared_data_model.md; additions are marked (proposed).
import { z } from "zod";

export const BusinessType = z.enum(["cafe", "restaurant", "retail_boutique"]);
export const FoodService = z.enum(["none", "prepackaged_only", "prepared_food"]);
export const Alcohol = z.enum(["none", "beer_wine", "full_bar"]);
export const Acquisition = z.enum(["new_buildout", "second_generation", "change_of_ownership"]);
export const EntityType = z.enum(["sole_prop", "llc", "corporation", "partnership", "undecided"]);
export type BusinessType = z.infer<typeof BusinessType>;

export const Jurisdiction = z.object({
  kind: z.enum(["city", "unincorporated", "out_of_area"]),
  cityId: z.string().optional(),
  cityName: z.string().optional(),
  county: z.string(),
  censusTract: z.string().optional(),
  supported: z.boolean(),
});
export type Jurisdiction = z.infer<typeof Jurisdiction>;

export const Address = z.object({
  raw: z.string(),
  normalized: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const BusinessProfile = z.object({
  id: z.string(),
  businessName: z.string().optional(),
  description: z.string().optional(), // (proposed) the owner's own one-line description
  businessType: BusinessType,
  address: Address,
  jurisdiction: Jurisdiction.optional(),
  squareFeet: z.number().optional(),
  groundFloor: z.boolean().optional(),
  storefrontVacantMonths: z.number().optional(),
  foodService: FoodService,
  alcohol: Alcohol,
  seats: z.number().optional(),
  outdoorSeating: z.boolean().optional(),
  exteriorSign: z.boolean().optional(),
  acquisition: Acquisition,
  entityType: EntityType,
  employeesPlanned: z.number().optional(),
  budgetUsd: z.number().optional(),
  monthlyRentUsd: z.number().optional(),
  targetOpenDate: z.string().optional(),
  planStartDate: z.string(),
  language: z.enum(["en", "es", "vi", "zh"]),
  // (proposed) fields we filled with a default rather than the owner's answer.
  // The UI shows these as "assumed" chips so the owner can correct them.
  assumed: z.array(z.string()),
});
export type BusinessProfile = z.infer<typeof BusinessProfile>;

// What the chat (or a form edit) may change. Jurisdiction is never patched directly.
export const ProfilePatch = BusinessProfile.omit({ id: true, jurisdiction: true, assumed: true, planStartDate: true, language: true }).partial();
export type ProfilePatch = z.infer<typeof ProfilePatch>;

export type Range = { min: number; typical: number; max: number };

export type JsonLogic = Record<string, unknown> | boolean;

export const PHASES = ["before_lease", "register", "build", "before_open", "after_open"] as const;
export type Phase = (typeof PHASES)[number];

export type Office = { name: string; address: string; hours: string; phone: string };

export type PermitRule = {
  id: string;
  name: string; // official name
  plainName: string; // (proposed) what an owner would call it
  phase: Phase; // (proposed) when in the journey it happens
  whatToDo: string[]; // (proposed) plain-language steps
  contact?: string;
  office?: Office; // (proposed) where to go in person
  links?: { label: string; url: string }[]; // (proposed) direct official links: apply online, forms, fees
  feeNote?: string; // (proposed) where the fee comes from / when it's an estimate
  feePerPerson?: { base: number; included: number; perPerson: number }; // (proposed) e.g. San José business tax
  shortDescription: string;
  agency: string;
  level: "federal" | "state" | "county" | "city";
  kind?: "permit" | "work"; // (proposed) "work" = owner's construction time, not a permit
  gatesOpening?: boolean; // (proposed) false = can finish after opening day
  scaleBySqft?: boolean; // (proposed) scale duration and fee by size
  jurisdictions: string[];
  appliesWhen: JsonLogic;
  dependsOn: string[];
  durationDays: Range;
  feeUsd: Range;
  howToApply: string;
  requiredDocs: string[];
  sourceUrl: string;
  lastVerified: string;
  verified: boolean;
  warnings?: string[];
};

export type CostRule = {
  id: string;
  category: CostCategory;
  label: string;
  appliesWhen: JsonLogic;
  jurisdictions: string[];
  // permit_fees and rent_until_open are (proposed): they read from the plan itself
  formula: "fixed" | "per_sqft" | "per_seat" | "months_of_rent" | "percent_of_subtotal" | "permit_fees" | "rent_until_open";
  amount: { low: number; typical: number; high: number };
  verified: boolean;
  note?: string;
};

export const COST_CATEGORIES = [
  "permits_fees", "deposits", "buildout", "equipment", "inventory", "professional_services", "carrying_costs", "contingency",
] as const;
export type CostCategory = (typeof COST_CATEGORIES)[number];

export type IncentiveRule = {
  id: string;
  name: string;
  provider: string;
  jurisdictions: string[];
  eligibleWhen: JsonLogic;
  likelyEligibleWhen?: JsonLogic;
  eligibleReason: string;
  likelyReason?: string;
  missingQuestion?: { field: keyof BusinessProfile; question: string; options: { label: string; value: unknown }[] };
  valueDescription: string;
  requirements: string[];
  howToApply: string;
  sourceUrl: string;
  lastVerified: string;
  verified: boolean;
  status: "active" | "paused" | "unknown";
};

export type PlanPermitItem = {
  ruleId: string;
  name: string;
  plainName: string;
  phase: Phase;
  whatToDo: string[];
  contact?: string;
  office?: Office;
  links: { label: string; url: string }[];
  feeNote?: string;
  shortDescription: string;
  agency: string;
  level: PermitRule["level"] | "work";
  startDay: number;
  endDay: number;
  slowEndDay: number;
  durationDays: Range;
  fee: Range;
  dependsOn: string[];
  isCriticalPath: boolean;
  gatesOpening: boolean;
  howToApply: string;
  requiredDocs: string[];
  sourceUrl: string;
  verified: boolean;
  warnings: string[];
};

export type CostLine = { ruleId: string; category: CostCategory; label: string; low: number; typical: number; high: number; verified: boolean };

export type IncentiveMatch = {
  ruleId: string;
  name: string;
  provider: string;
  match: "eligible" | "may_qualify" | "not_eligible";
  reason: string;
  valueDescription: string;
  requirements: string[];
  sourceUrl: string;
  verified: boolean;
  status: IncentiveRule["status"];
  missingQuestion?: IncentiveRule["missingQuestion"];
};

export type Plan = {
  profile: BusinessProfile;
  items: PlanPermitItem[];
  days: { min: number; typical: number; max: number };
  openDate: { fast: string; typical: string; slow: string };
  costs: { lines: CostLine[]; total: { low: number; typical: number; high: number }; monthlyRent: number };
  incentives: IncentiveMatch[];
};

export type PlanDiff = {
  added: PlanPermitItem[];
  removed: PlanPermitItem[];
  openDeltaDays: number;
  fromDate: string;
  toDate: string;
  costDelta: number;
  fromCost: number;
  toCost: number;
  planStart: string;
  gained: IncentiveMatch[];
  lost: IncentiveMatch[];
  jurisdiction?: { from: string; to: string };
};
