// Deterministic fallback used when no Claude API key is set (or the call fails).
// Same output shape as the Claude path, so the rest of the app doesn't care which one ran.
import type { BusinessProfile, BusinessType, Plan, ProfilePatch } from "@/lib/schemas";
import { kmoney, money } from "@/lib/dates";

export type ChatResult = {
  action: "update_profile" | "answer" | "clarify";
  patch: ProfilePatch;
  reply: string;
  clarification?: { question: string; options: string[] };
  source: "claude" | "local";
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const num = (s: string, suffix?: string) => {
  let v = parseFloat(s.replace(/,/g, ""));
  if (suffix === "k") v *= 1e3;
  if (suffix === "m") v *= 1e6;
  return Math.round(v);
};

export function detectType(m: string): BusinessType | undefined {
  if (/boutique|clothing|apparel|gift shop|retail|bookstore|florist|\bstore\b|\bshop\b(?! coffee)/.test(m) && !/coffee shop|tea shop|donut shop|bake shop/.test(m)) return "retail_boutique";
  if (/restaurant|taqueria|pizz|ramen|diner|bistro|grill|sushi|pho|kitchen|eatery|brewpub/.test(m)) return "restaurant";
  if (/caf[eé]|coffee|espresso|tea (shop|house)|bakery|donut|boba|juice/.test(m)) return "cafe";
  return undefined;
}

export function extractAddress(text: string): string | undefined {
  const m = text.match(/\d{1,6}\s+[\w .'-]+?\b(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|way|ln|lane|ct|court|pl|place|expy|hwy)\b\.?[^.;\n]*/i);
  return m ? m[0].replace(/\s+/g, " ").trim().replace(/[,.]$/, "") : undefined;
}

/** Pull whatever profile fields the text states. Missing fields stay undefined. */
export function parseFacts(text: string, current?: BusinessProfile): ProfilePatch {
  const m = text.toLowerCase();
  const patch: ProfilePatch = {};
  const neg = (w: string) => new RegExp(`(no|drop|remove|without|skip|cancel|forget|not)( the| any| serve| serving| sell| selling)? (${w})`).test(m);
  const switching = !current || /(make it|switch|instead|back to|actually|turn it|change it|open a|it'?s a|become|rather)/.test(m);

  const t = detectType(m);
  if (t && switching) {
    patch.businessType = t;
    patch.foodService = t === "retail_boutique" ? "none" : "prepared_food";
  }
  if (/prepackaged|pre-packaged|packaged (food|snacks)|wrapped pastries/.test(m)) patch.foodService = "prepackaged_only";
  else if (/prepared food|with a kitchen|cook on site|hot food|(make|making|cook|cooking|prepare|preparing|assemble|bake|baking|grill)\w* (our own |fresh |the )?(food|sandwiches|breakfast|lunch|meals|pastries|salads|burritos|pizza|bread|toast|bagels|dishes)/.test(m)) patch.foodService = "prepared_food";
  else if (/(no food|not sell(ing)? food|only drinks|just drinks|drinks only)/.test(m)) patch.foodService = current?.businessType === "retail_boutique" ? "none" : "prepackaged_only";

  if (/full bar|cocktail|spirits|liquor/.test(m) && !neg("full bar|cocktails|liquor|bar|spirits")) patch.alcohol = "full_bar";
  else if (neg("alcohol|beer|wine|bar|booze|beer and wine|beer & wine")) patch.alcohol = "none";
  else if (/beer|wine/.test(m)) patch.alcohol = "beer_wine";

  if (/(buy|buying|take over|taking over|acquir|purchas)\w*.*(existing|cousin|restaurant|caf|taqueria|business|shop)|change of ownership/.test(m)) patch.acquisition = "change_of_ownership";
  else if (/empty shell|raw space|new build|build.?out from scratch|cold shell|never been a restaurant|vanilla shell/.test(m)) patch.acquisition = "new_buildout";
  else if (/second.generation|former (caf|restaurant|coffee)|old (caf|restaurant)|used to be a (caf|restaurant|coffee)/.test(m)) patch.acquisition = "second_generation";

  const addr = extractAddress(text);
  if (addr) patch.address = { raw: addr };
  else if (/sunnyvale/.test(m)) patch.address = { raw: "150 S Murphy Ave, Sunnyvale, CA 94086" };
  else if (/willow glen/.test(m)) patch.address = { raw: "1375 Lincoln Ave, San Jose, CA 95125" };

  const b = m.match(/(budget|have|raise[ds]?|saved)[^\d$]{0,20}\$?\s?([\d,.]+)\s?(k|m)?\b/);
  if (b) patch.budgetUsd = num(b[2], b[3]);
  const rent = m.match(/rent[^\d$]{0,15}\$?\s?([\d,.]+)\s?(k)?/);
  if (rent) patch.monthlyRentUsd = num(rent[1], rent[2]);
  const d = m.match(/open (?:by|before|in|on)\s+([a-z]+)\.?\s*(\d{1,2})?(?:,?\s*(\d{4}))?/);
  if (d && MONTHS.includes(d[1].slice(0, 3))) {
    const start = current?.planStartDate ?? new Date().toISOString().slice(0, 10);
    const mi = MONTHS.indexOf(d[1].slice(0, 3));
    const yr = d[3] ? +d[3] : +start.slice(0, 4);
    let iso = `${yr}-${String(mi + 1).padStart(2, "0")}-${String(+(d[2] || 1)).padStart(2, "0")}`;
    if (!d[3] && iso <= start) iso = `${yr + 1}${iso.slice(4)}`;
    patch.targetOpenDate = iso;
  }
  if (/patio|outdoor|sidewalk (seating|tables|caf)/.test(m)) patch.outdoorSeating = !neg("patio|outdoor seating|sidewalk seating|outdoor|sidewalk tables");
  if (/\bsign(age)?\b/.test(m) && !/sign (the|a) lease/.test(m)) patch.exteriorSign = !neg("sign|signage|new sign");
  const sq = m.match(/([\d,]{3,})\s?(sq\.? ?ft|square feet|sf\b)/);
  if (sq) patch.squareFeet = num(sq[1]);
  const seats = m.match(/(\d+)\s+seats/);
  if (seats) patch.seats = +seats[1];
  const emp = m.match(/(\d+)\s+(employees|staff|people|hires|workers)/) || m.match(/hire (\d+)/);
  if (emp) patch.employeesPlanned = +emp[1];
  if (/no employees|just me|by myself|solo/.test(m)) patch.employeesPlanned = 0;
  if (/\bllc\b/.test(m)) patch.entityType = "llc";
  else if (/sole prop/.test(m)) patch.entityType = "sole_prop";
  else if (/corporation|\bs-?corp\b/.test(m)) patch.entityType = "corporation";
  const vac = m.match(/(vacant|empty) (?:for )?(\d+)\s*(months?|years?)/);
  if (vac) patch.storefrontVacantMonths = +vac[2] * (vac[3].startsWith("y") ? 12 : 1);
  if (/second floor|upstairs|2nd floor/.test(m)) patch.groundFloor = false;

  if (current) for (const k of Object.keys(patch) as (keyof ProfilePatch)[]) {
    // Keep a value that confirms an assumption, so it stops being "assumed".
    if (JSON.stringify(patch[k]) === JSON.stringify(current[k]) && !current.assumed.includes(k)) delete patch[k];
  }
  return patch;
}

const EXPLAIN: [RegExp, string[]][] = [
  [/seller|sales tax|cdtfa/, ["cdtfa_sellers_permit"]], [/business tax|tax cert/, ["sj_business_tax_certificate"]], [/plan check/, ["deh_plan_check"]],
  [/health permit|permit to operate/, ["deh_permit_to_operate"]], [/abc|alcohol licen|liquor licen|type 4|type 2/, ["abc_type41", "abc_type47", "abc_type20", "abc_type21"]],
  [/building permit|tenant improvement/, ["sj_building_permit", "sj_building_permit_srp", "scc_building_permit"]], [/zoning/, ["sj_zoning_check", "scc_zoning_clearance"]],
  [/fire|hood/, ["scc_fire_marshal_review", "sj_building_permit_srp", "sj_building_permit"]], [/\bein\b|employer id/, ["irs_ein"]], [/fictitious|dba/, ["scc_fbn"]],
  [/llc|articles/, ["sos_llc", "sos_corp"]], [/change of ownership/, ["deh_change_of_ownership"]], [/sign permit/, ["sj_sign_permit", "scc_sign_permit"]],
  [/sidewalk|encroachment/, ["sj_sidewalk_cafe", "scc_encroachment_permit"]], [/manager cert|food safety/, ["food_manager_cert"]],
];

export function localAnswer(message: string, plan: Plan): string {
  const m = message.toLowerCase();
  const hit = EXPLAIN.find(([re]) => re.test(m));
  if (hit) {
    const it = plan.items.find(i => hit[1].includes(i.ruleId));
    if (!it) return "That isn't in your current plan, so you don't need it with this profile.";
    const after = it.dependsOn.map(d => plan.items.find(x => x.ruleId === d)?.name).filter(Boolean);
    const steps = it.whatToDo.length ? ` First step: ${it.whatToDo[0]}` : "";
    return `${it.plainName} (${it.name}, ${it.agency}): ${it.shortDescription}${steps} It takes about ${it.durationDays.typical} days and costs ${it.fee.typical ? money(it.fee.typical) : "nothing"}${after.length ? `, after ${after.join(" and ")}` : ""}.${it.isCriticalPath ? " It's on your critical path, so a delay here moves opening day." : ""}`;
  }
  if (/risk|critical|bottleneck|slow|delay|longest/.test(m)) {
    const crit = plan.items.filter(i => i.isCriticalPath).sort((a, b) => b.durationDays.typical - a.durationDays.typical);
    const over = plan.profile.budgetUsd ? plan.costs.total.typical - plan.profile.budgetUsd : 0;
    if (!crit.length) return "Nothing in this plan takes long.";
    return `Your biggest schedule risk is ${crit[0].name} (about ${crit[0].durationDays.typical} days, up to ${crit[0].durationDays.max}). Each month it slips costs about ${money(plan.costs.monthlyRent)} in rent.${over > 0 ? ` On money, you're ${kmoney(over)} over budget in the typical case.` : ""}`;
  }
  if (/cost|expensive|money|budget|afford/.test(m)) {
    const top = [...plan.costs.lines].sort((a, b) => b.typical - a.typical)[0];
    return `Your largest cost is ${top.label.toLowerCase()} at ${money(top.typical)}. The typical total is ${money(plan.costs.total.typical)}.`;
  }
  if (/grant|incentive|program|help/.test(m)) {
    const inc = plan.incentives.filter(i => i.match !== "not_eligible");
    return inc.length ? `You may qualify for: ${inc.map(i => i.name).join(", ")}. See the Incentives section.` : "No programs match this profile right now.";
  }
  return `I can change the plan when you tell me about alcohol, food, business type, address, the space, budget, target date, seating or signs. I can also explain any permit. Try "add beer and wine" or "why do I need a seller's permit?"`;
}

export function localChat(message: string, plan: Plan): ChatResult {
  const m = message.toLowerCase();
  if (/sell (some )?food|some snacks|a little food/.test(m) && !/prepared|packaged|kitchen/.test(m))
    return { action: "clarify", patch: {}, reply: "", source: "local",
      clarification: { question: "Will the food be prepared on site, or only prepackaged items like wrapped pastries? It changes the County health permit path.", options: ["Prepackaged food only", "Prepared food with a kitchen"] } };
  if (/boutique with a (full )?kitchen/.test(m))
    return { action: "clarify", patch: {}, reply: "", source: "local",
      clarification: { question: "A boutique with a kitchen is really a food business. Which do you mean?", options: ["Boutique, no food", "Make it a café with retail shelves"] } };
  const whatIf = /what about|what if|how about/.test(m);
  const request = /^(can|could|let'?s|please) ?(we|i|you)? ?(add|make|switch|move|change|drop|remove|try)/.test(m.trim());
  const isQuestion = !whatIf && !request && (/^(why|what|how|when|which|do i|does|is|can)\b/.test(m.trim()) || m.trim().endsWith("?"));
  const patch = isQuestion ? {} : parseFacts(message, plan.profile);
  if (Object.keys(patch).length) return { action: "update_profile", patch, reply: "", source: "local" };
  return { action: "answer", patch: {}, reply: localAnswer(message, plan), source: "local" };
}
