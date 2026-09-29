import type { BusinessProfile } from "@/lib/schemas";

/** The most useful thing to ask next, in the order it changes the plan. Used by the offline chat and the opening message. */
export function nextQuestion(p: BusinessProfile): string | null {
  const food = p.businessType !== "retail_boutique";
  const a = (k: string) => p.assumed.includes(k);
  if (food && a("foodService")) return "Will you make or assemble food on site, or only sell prepackaged items like wrapped pastries and bottled drinks?";
  if (!food && a("foodService")) return "Will you sell any food or drinks, even prepackaged snacks?";
  if (a("acquisition")) return food
    ? "What's the space today: a former café or restaurant, an empty shell, or are you buying an existing business?"
    : "What's the space today: a former shop, an empty shell, or are you buying an existing business?";
  if (food && a("alcohol")) return "Do you plan to serve beer and wine, a full bar, or no alcohol?";
  if (a("squareFeet")) return "Roughly how big is the space, in square feet?";
  if (a("monthlyRentUsd")) return "What's the monthly rent, or your best guess?";
  if (p.budgetUsd === undefined) return "How much money do you have to open, including savings and loans?";
  if (p.targetOpenDate === undefined) return "Is there a date you'd like to be open by?";
  if (p.storefrontVacantMonths === undefined && p.jurisdiction?.cityId === "san_jose") return "How long has the space been empty? San José has a grant for storefronts vacant more than 3 months.";
  return null;
}
