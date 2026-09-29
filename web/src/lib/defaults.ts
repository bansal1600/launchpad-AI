import type { BusinessProfile, BusinessType, ProfilePatch } from "@/lib/schemas";
import { todayIso } from "@/lib/dates";

// Only these change the permit path. Everything else gets a default the owner can correct.
export const PERMIT_CRITICAL = ["businessType", "address", "foodService", "alcohol", "acquisition"] as const;

const BY_TYPE: Record<BusinessType, Partial<BusinessProfile>> = {
  cafe: { foodService: "prepared_food", alcohol: "none", acquisition: "second_generation", squareFeet: 1200, employeesPlanned: 4, seats: 24 },
  restaurant: { foodService: "prepared_food", alcohol: "none", acquisition: "second_generation", squareFeet: 2000, employeesPlanned: 8, seats: 50 },
  retail_boutique: { foodService: "none", alcohol: "none", acquisition: "second_generation", squareFeet: 1000, employeesPlanned: 1 },
};
const COMMON: Partial<BusinessProfile> = { entityType: "llc", groundFloor: true, exteriorSign: true, outdoorSeating: false };
export const RENT_PER_SQFT = 4; // $/sq ft/month, assumed for Santa Clara County storefronts

/** Merge what the owner told us over type defaults, and record which fields were assumed. */
export function completeProfile(known: ProfilePatch & { businessType: BusinessType; address: BusinessProfile["address"] }, id = crypto.randomUUID()): BusinessProfile {
  const assumed: string[] = [];
  const base = { ...COMMON, ...BY_TYPE[known.businessType] };
  const out: Record<string, unknown> = { id, planStartDate: todayIso(), language: "en" };
  for (const [k, v] of Object.entries(base)) {
    const given = (known as Record<string, unknown>)[k];
    if (given === undefined || given === null) { out[k] = v; assumed.push(k); } else out[k] = given;
  }
  for (const [k, v] of Object.entries(known)) if (v !== undefined && v !== null && !(k in base)) out[k] = v;
  if (out.monthlyRentUsd === undefined) { out.monthlyRentUsd = Math.round(((out.squareFeet as number) * RENT_PER_SQFT) / 50) * 50; assumed.push("monthlyRentUsd"); }
  out.assumed = assumed;
  return out as BusinessProfile;
}

/** Apply a patch; any field the owner sets stops being "assumed". Rent follows size while it's still assumed. */
export function applyPatch(p: BusinessProfile, patch: ProfilePatch): BusinessProfile {
  const next = { ...p, ...patch } as BusinessProfile;
  const touched = Object.keys(patch);
  next.assumed = p.assumed.filter(k => !touched.includes(k));
  if (patch.businessType && patch.businessType !== p.businessType) {
    // switching type re-derives type defaults the owner never set
    for (const [k, v] of Object.entries(BY_TYPE[patch.businessType])) {
      if (p.assumed.includes(k) && !touched.includes(k)) (next as Record<string, unknown>)[k] = v;
    }
  }
  if (next.assumed.includes("monthlyRentUsd") && next.squareFeet) next.monthlyRentUsd = Math.round((next.squareFeet * RENT_PER_SQFT) / 50) * 50;
  if (patch.address && patch.address.raw !== p.address.raw) delete next.jurisdiction;
  return next;
}

export const FIELD_LABELS: Record<string, string> = {
  businessType: "Business type", foodService: "Food", alcohol: "Alcohol", acquisition: "Space", squareFeet: "Size", employeesPlanned: "Employees",
  seats: "Seats", entityType: "Entity", groundFloor: "Ground floor", exteriorSign: "Exterior sign", outdoorSeating: "Sidewalk seating",
  monthlyRentUsd: "Rent", budgetUsd: "Budget", targetOpenDate: "Target opening", storefrontVacantMonths: "Vacancy", address: "Address",
};
export const VALUE_LABELS: Record<string, Record<string, string>> = {
  businessType: { cafe: "Café", restaurant: "Restaurant", retail_boutique: "Retail boutique" },
  foodService: { none: "No food", prepackaged_only: "Prepackaged food only", prepared_food: "Prepared food" },
  alcohol: { none: "No alcohol", beer_wine: "Beer & wine", full_bar: "Full bar" },
  acquisition: { new_buildout: "Empty shell (new buildout)", second_generation: "Former food/retail space", change_of_ownership: "Buying an existing business" },
  entityType: { llc: "LLC", sole_prop: "Sole proprietor", corporation: "Corporation", partnership: "Partnership", undecided: "Undecided" },
};
