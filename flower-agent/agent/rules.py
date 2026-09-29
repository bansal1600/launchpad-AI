"""Fallback permit rules for San José / Santa Clara County / California.

Ported from the Launchpad AI web app (web/src/rules/permits.json). Agency agents
search official sites first; these rules fill in when a search comes back empty
or unusable, so the plan is never blank. Values marked verified=True were checked
against the linked official page in Sep 2026; the rest are estimates.

`when` keys: food (prepared on site), alcohol, build (construction needed),
llc, employees, sign, change_owner (buying an existing business).
"""

from __future__ import annotations

from typing import Any

Rule = dict[str, Any]

RULES: list[Rule] = [
    # ---- City of San José -------------------------------------------------
    {"id": "sj_zoning_check", "level": "city", "name": "Check the address allows your business (zoning)",
     "agency": "San José Planning, Building & Code Enforcement", "fee_usd": 0, "duration_days": 5,
     "depends_on": [], "when": {}, "verified": True,
     "source_url": "https://www.sanjoseca.gov/business/development-services-permit-center/online-permits-at-sjpermits-org/planning-online-permits"},
    {"id": "sj_business_tax_certificate", "level": "city", "name": "Business Tax Certificate",
     "agency": "City of San José Finance Department", "fee_usd": 227, "duration_days": 3,
     "depends_on": ["irs_ein"], "when": {}, "verified": True,
     "source_url": "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/business-tax-rates"},
    {"id": "sj_building_permit", "level": "city", "name": "Building permit (tenant improvement)",
     "agency": "San José Planning, Building & Code Enforcement", "fee_usd": 6000, "duration_days": 45,
     "depends_on": ["sj_zoning_check", "deh_plan_check"], "when": {"build": True}, "verified": True,
     "source_url": "https://www.sjeconomy.com/how-we-help/programs-and-services/streamlined-restaurant-program"},
    {"id": "sj_sign_permit", "level": "city", "name": "Sign permit",
     "agency": "San José Planning, Building & Code Enforcement", "fee_usd": 600, "duration_days": 20,
     "depends_on": ["sj_zoning_check"], "when": {"sign": True}, "verified": True, "gates_opening": False,
     "source_url": "https://www.sanjoseca.gov/business/apply-for-sign-permit"},
    {"id": "build_out", "level": "work", "name": "Construction and fit-out (your contractor)",
     "agency": "Your contractor", "fee_usd": 0, "duration_days": 35,
     "depends_on": ["sj_building_permit"], "when": {"build": True}, "verified": True, "source_url": ""},
    {"id": "sj_final_inspection", "level": "city", "name": "Final building inspection",
     "agency": "San José Planning, Building & Code Enforcement", "fee_usd": 0, "duration_days": 10,
     "depends_on": ["build_out"], "when": {"build": True}, "verified": True,
     "source_url": "https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/restaurants-or-food-beverage-service"},
    # ---- County of Santa Clara ---------------------------------------------
    {"id": "deh_plan_check", "level": "county", "name": "Food facility plan check",
     "agency": "County of Santa Clara Department of Environmental Health", "fee_usd": 2400, "duration_days": 42,
     "depends_on": ["sj_zoning_check"], "when": {"food": True, "change_owner": False}, "verified": True,
     "source_url": "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and"},
    {"id": "deh_change_of_ownership", "level": "county", "name": "Food facility evaluation (change of ownership)",
     "agency": "County of Santa Clara Department of Environmental Health", "fee_usd": 700, "duration_days": 14,
     "depends_on": [], "when": {"food": True, "change_owner": True}, "verified": True,
     "source_url": "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/restaurant-grocery-store-or-other-fixed-food"},
    {"id": "deh_permit_to_operate", "level": "county", "name": "Health permit to operate",
     "agency": "County of Santa Clara Department of Environmental Health", "fee_usd": 1100, "duration_days": 7,
     "depends_on": ["sj_final_inspection", "deh_change_of_ownership"], "when": {"food": True}, "verified": True,
     "source_url": "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and"},
    {"id": "scc_fbn", "level": "county", "name": "Fictitious Business Name (DBA)",
     "agency": "Santa Clara County Clerk-Recorder", "fee_usd": 40, "duration_days": 30,
     "depends_on": ["sos_llc"], "when": {}, "verified": True, "gates_opening": False,
     "source_url": "https://clerkrecorder.santaclaracounty.gov/business-services/apply-renew-or-refile-fictitious-business-name-fbn-statement"},
    # ---- State of California -----------------------------------------------
    {"id": "sos_llc", "level": "state", "name": "Form your LLC (Articles of Organization)",
     "agency": "California Secretary of State", "fee_usd": 70, "duration_days": 5,
     "depends_on": [], "when": {"llc": True}, "verified": False,
     "source_url": "https://bizfileonline.sos.ca.gov/"},
    {"id": "cdtfa_sellers_permit", "level": "state", "name": "Seller's permit",
     "agency": "CA Department of Tax and Fee Administration", "fee_usd": 0, "duration_days": 1,
     "depends_on": ["irs_ein"], "when": {}, "verified": True,
     "source_url": "https://cdtfa.ca.gov/taxes-and-fees/faqseller.htm"},
    {"id": "edd_employer", "level": "state", "name": "Register as an employer (payroll taxes)",
     "agency": "CA Employment Development Department", "fee_usd": 0, "duration_days": 1,
     "depends_on": ["irs_ein"], "when": {"employees": True}, "verified": True, "gates_opening": False,
     "source_url": "https://edd.ca.gov/en/payroll_taxes/am_i_required_to_register_as_an_employer"},
    {"id": "abc_type41", "level": "state", "name": "ABC Type 41 license (beer & wine with meals)",
     "agency": "CA Department of Alcoholic Beverage Control", "fee_usd": 1135, "duration_days": 90,
     "depends_on": ["sj_business_tax_certificate", "sj_zoning_check"], "when": {"alcohol": True}, "verified": True,
     "source_url": "https://www.abc.ca.gov/licensing/license-fees/application-fee-schedules/"},
    {"id": "food_manager_cert", "level": "state", "name": "Food protection manager certificate (within 60 days of opening)",
     "agency": "ANSI-accredited provider (CA Health & Safety Code 113947.1)", "fee_usd": 150, "duration_days": 7,
     "depends_on": [], "when": {"food": True}, "verified": True, "gates_opening": False,
     "source_url": "https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=113947.1.&lawCode=HSC"},
    # ---- Federal -------------------------------------------------------------
    {"id": "irs_ein", "level": "federal", "name": "Federal tax ID (EIN)",
     "agency": "Internal Revenue Service", "fee_usd": 0, "duration_days": 1,
     "depends_on": ["sos_llc"], "when": {}, "verified": False,
     "source_url": "https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online"},
]


def profile_flags(profile: dict[str, Any]) -> dict[str, bool]:
    """Turn an intake profile into the yes/no facts the rules check."""
    food = profile.get("food_service") == "prepared_food"
    acquisition = profile.get("acquisition", "second_generation")
    return {
        "food": food,
        "alcohol": profile.get("alcohol", "none") != "none",
        "change_owner": acquisition == "change_of_ownership",
        "build": acquisition == "new_buildout" or (acquisition == "second_generation" and food),
        "llc": profile.get("entity_type", "llc") == "llc",
        "employees": int(profile.get("employees", 0) or 0) > 0,
        "sign": bool(profile.get("exterior_sign", True)),
    }


def fallback_steps(profile: dict[str, Any], level: str | None = None) -> list[Rule]:
    """Rules that apply to this profile, optionally for one government level."""
    flags = profile_flags(profile)
    out = []
    for rule in RULES:
        if level and rule["level"] != level and not (level == "state" and rule["level"] == "federal"):
            continue
        if all(flags.get(k) == v for k, v in rule["when"].items()):
            out.append({k: v for k, v in rule.items() if k != "when"})
    return out


# How to recognise an agency agent's step as one of the known rules.
MATCH: dict[str, str] = {
    "sj_zoning_check": r"zoning",
    "sj_business_tax_certificate": r"business tax|tax certificate|business license",
    "sj_building_permit": r"building permit|tenant improvement",
    "sj_sign_permit": r"\bsign",
    "sj_final_inspection": r"final (building )?inspection|occupancy",
    "deh_plan_check": r"plan check|plan review",
    "deh_change_of_ownership": r"change of ownership|facility evaluation",
    "deh_permit_to_operate": r"health permit|permit to operate",
    "scc_fbn": r"fictitious|\bdba\b|business name statement",
    "sos_llc": r"secretary of state|articles of organization|business entity|\bllc\b",
    "cdtfa_sellers_permit": r"seller",
    "edd_employer": r"\bedd\b|employer registration|payroll|register as .*employer",
    "abc_type41": r"\babc\b|alcohol|beer|wine|liquor",
    "food_manager_cert": r"food (safety|protection|handler)|manager cert",
    "irs_ein": r"\bein\b|employer identification",
}
_BY_ID = {r["id"]: r for r in RULES}


def match_rule(step: dict[str, Any]) -> Rule | None:
    """Find the built-in rule an agency step corresponds to, if any."""
    import re

    text = f"{step.get('name', '')} {step.get('id', '')}".lower()
    for rule_id, pattern in MATCH.items():
        if re.search(pattern, text):
            return _BY_ID[rule_id]
    return None


def is_relevant(step: dict[str, Any], profile: dict[str, Any]) -> bool:
    """Drop steps that contradict the owner's facts (agents sometimes over-include)."""
    rule = match_rule(step)
    if rule is None:
        return True
    flags = profile_flags(profile)
    return all(flags.get(k) == v for k, v in rule["when"].items())


def enrich(step: dict[str, Any]) -> dict[str, Any]:
    """Fill a missing or implausible fee/duration from the matching rule, flagged as an estimate."""
    rule = match_rule(step)
    if rule is None:
        return step
    if step.get("duration_days") is None or (step["duration_days"] <= 2 and rule["duration_days"] >= 7):
        step["duration_days"], step["estimated"] = rule["duration_days"], True
    if step.get("fee_usd") is None or (step["fee_usd"] == 0 and rule["fee_usd"] > 0):
        step["fee_usd"], step["estimated"] = rule["fee_usd"], True
    if rule.get("gates_opening") is False:
        step["gates_opening"] = False
    return step


def missing_essentials(steps: list[dict[str, Any]], profile: dict[str, Any]) -> list[Rule]:
    """Core rules for this profile that no agency step covers (e.g. the agent missed plan check)."""
    covered = {r["id"] for r in (match_rule(s) for s in steps) if r}
    essentials = {"sj_zoning_check", "sj_building_permit", "sj_final_inspection", "deh_plan_check",
                  "deh_permit_to_operate", "deh_change_of_ownership", "cdtfa_sellers_permit", "abc_type41"}
    return [r for r in fallback_steps(profile) if r["id"] in essentials and r["id"] not in covered]
