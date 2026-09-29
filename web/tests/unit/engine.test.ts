import { describe, expect, it } from "vitest";
import { buildPlan } from "@/lib/engine/buildPlan";
import { diffPlans, humanSummary } from "@/lib/engine/diff";
import { jurisdictionFromGeographies } from "@/lib/services/geocode";
import { applyPatch, completeProfile } from "@/lib/defaults";
import { localChat, parseFacts } from "@/lib/localParser";
import type { BusinessProfile, Jurisdiction } from "@/lib/schemas";

const SJ: Jurisdiction = { kind: "city", cityId: "san_jose", cityName: "San José", county: "santa_clara", supported: true };
const cafe = (): BusinessProfile => ({
  ...completeProfile({ businessType: "cafe", address: { raw: "87 N San Pedro St, San Jose, CA 95110" } }, "t1"),
  jurisdiction: SJ, planStartDate: "2026-09-28", squareFeet: 1400, monthlyRentUsd: 5600, storefrontVacantMonths: 8,
});
const ids = (p: BusinessProfile) => buildPlan(p).items.map(i => i.ruleId);

describe("intake defaults", () => {
  it("fills everything from type + address and marks it assumed", () => {
    const p = completeProfile({ businessType: "cafe", address: { raw: "x" } }, "id");
    expect(p.foodService).toBe("prepared_food");
    expect(p.assumed).toEqual(expect.arrayContaining(["foodService", "alcohol", "acquisition", "squareFeet", "monthlyRentUsd"]));
  });
  it("a stated fact stops being assumed", () => {
    const p = applyPatch(completeProfile({ businessType: "cafe", address: { raw: "x" } }, "id"), { alcohol: "beer_wine" });
    expect(p.assumed).not.toContain("alcohol");
  });
  it("parses a one-line description", () => {
    const f = parseFacts("A small coffee shop with beer and wine at 87 N San Pedro St, San Jose, about 1,400 sq ft, budget $250k");
    expect(f).toMatchObject({ businessType: "cafe", alcohol: "beer_wine", squareFeet: 1400, budgetUsd: 250000 });
    expect(f.address?.raw).toMatch(/^87 N San Pedro St/);
  });
});

describe("permit roadmap", () => {
  it("café in San José gets the county food path and city permits", () => {
    const i = ids(cafe());
    expect(i).toEqual(expect.arrayContaining(["deh_plan_check", "deh_permit_to_operate", "sj_business_tax_certificate", "sj_building_permit_srp", "cdtfa_sellers_permit"]));
    expect(i).not.toContain("abc_type41");
  });
  it("critical path runs zoning → plan check → building → construction → final → health permit", () => {
    const crit = buildPlan(cafe()).items.filter(i => i.isCriticalPath).map(i => i.ruleId);
    expect(crit).toEqual(["sj_zoning_check", "deh_plan_check", "sj_building_permit_srp", "work_kitchen_buildout", "sj_final_inspection", "deh_permit_to_operate"]);
  });
  it("every dependency starts after its prerequisites finish", () => {
    const plan = buildPlan(applyPatch(cafe(), { alcohol: "full_bar", outdoorSeating: true }));
    const byId = new Map(plan.items.map(i => [i.ruleId, i]));
    for (const i of plan.items) for (const d of i.dependsOn) expect(i.startDay).toBeGreaterThanOrEqual(byId.get(d)!.endDay);
  });
  it("unincorporated uses County land-use rules and no city tax certificate", () => {
    const i = ids({ ...cafe(), jurisdiction: { kind: "unincorporated", county: "santa_clara", supported: true } });
    expect(i).toContain("scc_zoning_clearance");
    expect(i).not.toContain("sj_business_tax_certificate");
  });
  it("Sunnyvale uses its own city rules", () => {
    const i = ids({ ...cafe(), jurisdiction: { kind: "city", cityId: "sunnyvale", cityName: "Sunnyvale", county: "santa_clara", supported: true } });
    expect(i).toEqual(expect.arrayContaining(["sv_zoning_check", "sv_business_license", "sv_building_permit", "sv_final_inspection", "deh_plan_check"]));
    expect(i.some(x => x.startsWith("sj_"))).toBe(false);
    expect(i).not.toContain("local_placeholder");
  });
  it("a city without loaded rules gets a placeholder instead of San José rules", () => {
    const i = ids({ ...cafe(), jurisdiction: { kind: "city", cityId: "campbell", cityName: "Campbell", county: "santa_clara", supported: false } });
    expect(i).toContain("local_placeholder");
    expect(i.some(x => x.startsWith("sj_"))).toBe(false);
  });
});

describe("real rule values", () => {
  it("San José business tax counts the owner: 4 staff + owner = base + 3 × $37.98", () => {
    const btc = buildPlan(applyPatch(cafe(), { employeesPlanned: 4 })).items.find(i => i.ruleId === "sj_business_tax_certificate")!;
    expect(btc.fee.typical).toBe(Math.round(226.89 + 3 * 37.98));
  });
  it("large food spaces use the standard building permit, not the fast track", () => {
    const i = ids(applyPatch(cafe(), { squareFeet: 4000 }));
    expect(i).toContain("sj_building_permit");
    expect(i).not.toContain("sj_building_permit_srp");
  });
  it("food manager certificate doesn't hold up opening day", () => {
    expect(buildPlan(cafe()).items.find(i => i.ruleId === "food_manager_cert")?.gatesOpening).toBe(false);
  });
});

describe("F08 demo changes", () => {
  const base = buildPlan(cafe());
  it("add beer and wine: ABC added, opening later, cost up", () => {
    const d = diffPlans(base, buildPlan(applyPatch(cafe(), { alcohol: "beer_wine" })));
    expect(d.added.map(i => i.ruleId)).toEqual(expect.arrayContaining(["abc_type41", "abc_issuance"]));
    expect(d.openDeltaDays).toBeGreaterThan(0);
    expect(d.costDelta).toBeGreaterThan(0);
    expect(humanSummary(d)).toMatch(/^\+2 permits/);
  });
  it("boutique instead: health permits removed, cost down", () => {
    const d = diffPlans(base, buildPlan(applyPatch(cafe(), { businessType: "retail_boutique", foodService: "none" })));
    expect(d.removed.map(i => i.ruleId)).toEqual(expect.arrayContaining(["deh_plan_check", "deh_permit_to_operate"]));
    expect(d.costDelta).toBeLessThan(0);
  });
  it("buying an existing café: change-of-ownership replaces plan check", () => {
    const d = diffPlans(base, buildPlan(applyPatch(cafe(), { acquisition: "change_of_ownership" })));
    expect(d.added.map(i => i.ruleId)).toContain("deh_change_of_ownership");
    expect(d.removed.map(i => i.ruleId)).toContain("deh_plan_check");
  });
  it("moving to Sunnyvale loses San José incentives", () => {
    const d = diffPlans(base, buildPlan({ ...cafe(), jurisdiction: { kind: "city", cityId: "sunnyvale", cityName: "Sunnyvale", county: "santa_clara", supported: false } }));
    expect(d.lost.map(i => i.ruleId)).toContain("sj_vacant_storefront");
    expect(d.jurisdiction).toEqual({ from: "San José", to: "Sunnyvale" });
  });
  it("over budget surfaces the microloan", () => {
    const plan = buildPlan(applyPatch(cafe(), { budgetUsd: 150000 }));
    expect(plan.incentives.find(i => i.ruleId === "sba_microloan")?.match).toBe("may_qualify");
  });
  it("unknown vacancy asks the question instead of guessing", () => {
    const plan = buildPlan({ ...cafe(), storefrontVacantMonths: undefined });
    const g = plan.incentives.find(i => i.ruleId === "sj_vacant_storefront")!;
    expect(g.match).toBe("may_qualify");
    expect(g.missingQuestion?.field).toBe("storefrontVacantMonths");
  });
  it("is deterministic", () => {
    expect(buildPlan(cafe())).toEqual(buildPlan(cafe()));
  });
});

describe("local chat fallback", () => {
  const plan = buildPlan(cafe());
  it.each([
    ["Add beer and wine", { alcohol: "beer_wine" }],
    ["Make it a boutique instead", { businessType: "retail_boutique", foodService: "none" }],
    ["I'm buying an existing café", { acquisition: "change_of_ownership" }],
    ["My budget is only $150K", { budgetUsd: 150000 }],
    ["I need to open by Feb 1", { targetOpenDate: "2027-02-01" }],
    ["Add sidewalk seating", { outdoorSeating: true }],
    ["can we add a full bar", { alcohol: "full_bar" }],
  ])("%s", (msg, patch) => {
    const r = localChat(msg, plan);
    expect(r.action).toBe("update_profile");
    expect(r.patch).toMatchObject(patch);
  });
  it("asks before guessing on 'sell some food'", () => expect(localChat("I want to sell some food", plan).action).toBe("clarify"));
  it("answers questions without changing the plan", () => {
    const r = localChat("Why do I need a seller's permit?", plan);
    expect(r.action).toBe("answer");
    expect(r.reply).toMatch(/Seller's Permit/);
  });
});

describe("jurisdiction detection", () => {
  const g = (place?: string, county = "06085") => ({
    Counties: [{ GEOID: county, NAME: "x", BASENAME: county === "06085" ? "Santa Clara" : "Alameda" }],
    ...(place ? { "Incorporated Places": [{ GEOID: place, NAME: "x", BASENAME: place === "0668000" ? "San Jose" : "Sunnyvale" }] } : {}),
  });
  it("San José", () => expect(jurisdictionFromGeographies(g("0668000"))).toMatchObject({ kind: "city", cityId: "san_jose", supported: true }));
  it("Sunnyvale is supported", () => expect(jurisdictionFromGeographies(g("0677000"))).toMatchObject({ kind: "city", cityId: "sunnyvale", supported: true }));
  it("no place = unincorporated", () => expect(jurisdictionFromGeographies(g())).toMatchObject({ kind: "unincorporated", supported: true }));
  it("other county = out of area", () => expect(jurisdictionFromGeographies(g(undefined, "06001"))).toMatchObject({ kind: "out_of_area" }));
});

describe("address display", () => {
  it("tidies Census all-caps addresses", async () => {
    const { tidyAddress } = await import("@/lib/services/geocode");
    expect(tidyAddress("87 N SAN PEDRO ST, SAN JOSE, CA, 95110")).toBe("87 N San Pedro St, San Jose, CA 95110");
  });
});

describe("chat fact extraction", () => {
  const plan = buildPlan(cafe());
  it("pulls several facts from one conversational message", () => {
    const r = localChat("yes we will make sandwiches, and we want beer and wine. the space is about 1,500 sq ft and rent is $6,000", plan);
    // foodService matches the assumed default; it's kept so the assumption becomes confirmed
    expect(r.patch).toEqual({ foodService: "prepared_food", alcohol: "beer_wine", squareFeet: 1500, monthlyRentUsd: 6000 });
    expect(parseFacts("we will make sandwiches")).toMatchObject({ foodService: "prepared_food" });
  });
});

describe("waves (what runs in parallel)", async () => {
  const { buildWaves } = await import("@/lib/engine/waves");
  const plan = buildPlan(applyPatch(cafe(), { alcohol: "beer_wine" }));
  const waves = buildWaves(plan);
  const waveOf = new Map(waves.flatMap(w => w.items.map(i => [i.ruleId, w.index] as const)));
  it("a step's prerequisites are in the same wave or an earlier one", () => {
    for (const i of plan.items) for (const d of i.dependsOn) expect(waveOf.get(i.ruleId)!).toBeGreaterThanOrEqual(waveOf.get(d)!);
  });
  it("wave dates match when their steps really start", () => {
    for (const w of waves.filter(w => !w.afterOpening)) for (const i of w.items) expect(i.startDay - w.startDay).toBeLessThan(7);
  });
  it("first wave holds things you can start today", () => {
    expect(waves[0].items.map(i => i.ruleId)).toEqual(expect.arrayContaining(["sj_zoning_check", "sos_llc"]));
    expect(waves[0].startDay).toBe(0);
  });
  it("after-opening steps are last", () => {
    expect(waves[waves.length - 1].afterOpening).toBe(true);
  });
});

describe("sign permits", () => {
  it("never hold up opening day", () => {
    for (const acquisition of ["new_buildout", "second_generation", "change_of_ownership"] as const) {
      const sign = buildPlan(applyPatch(cafe(), { acquisition, exteriorSign: true })).items.find(i => i.ruleId === "sj_sign_permit")!;
      expect(sign.gatesOpening).toBe(false);
      expect(sign.isCriticalPath).toBe(false);
    }
  });
});
