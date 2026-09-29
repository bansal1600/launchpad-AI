"""Comply Cofounder: a human-supervised multi-agent permit planner (Flower AgentApp).

Roles, each a separate model call with its own system prompt:
  Intake    - turns the owner's message into a JSON profile (asks one question if needed)
  Jurisdiction - decides whose rules apply (city, unincorporated county, out of area) via the Census geocoder
  City      - finds city requirements with web_search / web_fetch
  County    - finds County health requirements with web_search / web_fetch
  State     - finds state and federal requirements with web_search / web_fetch
  Planner   - fixes step dependencies; the schedule itself is computed in planning.py
  Checker   - marks steps without an official .gov source as "Needs verification"
  Reviewer  - applies a human's correction to a flagged step ("step 5 fee is $250, source ...")

The plan is shown and the run stops with an approval request. Only a later
"APPROVE" (read from the run-series history) confirms it, and only then are
deadline reminders offered through the start_automation connector.
"""

from __future__ import annotations

import json
import logging
import os
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any

from flwr.agentapp import AgentApp, AgentSession
from flwr.app import Context
from openai import OpenAI

from agent.planning import check_sources, clean_step, extract_json, format_plan, merge_steps, schedule
from agent.rules import enrich, fallback_steps, is_relevant, missing_essentials

DEFAULT_MODEL = "openai/gpt-5.6-sol"
MAX_TOOL_ITERATIONS = 5
APPROVAL_LINE = "Reply APPROVE to confirm, or tell me what to change."
EVENT_PLAN = "comply.plan"
EVENT_APPROVED = "comply.approved"
EVENT_STATUS = "comply.status"
# Event types Flower Chat renders: answer text, the collapsible "Reasoning" block, and run completion.
CHAT_TEXT = "response.output_text.delta"
CHAT_PROGRESS = "response.reasoning_summary_text.delta"
CHAT_DONE = "response.completed"

# Logs carry only counts and role names, never the owner's message, address or plan.
log = logging.getLogger("comply_cofounder")

app = AgentApp()

# ---------------------------------------------------------------- prompts

INTAKE_PROMPT = """You are the Intake agent for Comply Cofounder, a permit planner for opening a physical business in Santa Clara County, California.
Read the owner's message (and the previous profile, if given, which you should update rather than replace) and return ONLY a JSON object:
{"business_type": "cafe" | "restaurant" | "retail_boutique",
 "address": string, "city": string, "county": string,
 "food_service": "none" | "prepackaged_only" | "prepared_food",
 "alcohol": "none" | "beer_wine" | "full_bar",
 "acquisition": "second_generation" | "new_buildout" | "change_of_ownership",
 "entity_type": "llc" | "sole_prop" | "corporation" | "partnership",
 "employees": integer, "exterior_sign": boolean,
 "target_open_date": "YYYY-MM-DD" or null, "budget_usd": number or null,
 "question": string or null}
Defaults when not stated: cafes and restaurants prepare food on site; no alcohol; a former food or retail space (second_generation); llc; 4 employees for food, 1 for retail; exterior_sign true.
Set "question" only if the business type or address is missing or truly ambiguous; ask exactly one short question. Otherwise null."""

JURISDICTION_PROMPT = """You are the Jurisdiction agent. Decide which government's rules apply to a business address.
Call web_fetch once on this US Census geocoder URL (it returns JSON):
https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?benchmark=Public_AR_Current&vintage=Current_Current&layers=Incorporated%20Places,Counties&format=json&address=<URL-encoded address>
In the result, "Incorporated Places" names the city (none means unincorporated county land) and "Counties" names the county.
Return ONLY JSON: {"kind": "city" | "unincorporated" | "out_of_area", "city": string or null, "county": string, "matched_address": string or null}.
"out_of_area" means the county is not Santa Clara County. If the lookup fails, return {"kind": "unknown"}."""

REVIEWER_PROMPT = """You are the Reviewer agent. A human (the owner or a permit expert) is correcting steps in a permit plan.
You get the plan's steps (with their order numbers) and the human's message, which may name a step by number or by name. Return ONLY JSON:
{"edits": [{"order": number, "name"?: string, "agency"?: string, "fee_usd"?: number, "duration_days"?: number, "source_url"?: string, "remove"?: true}]}
Change only what the human said. If the message is not a step correction, return {"edits": []}."""

AGENCY_PROMPT = """You are the {role} agent for Comply Cofounder. Find the permits, licenses and registrations that a {kind} opening in {city}, {county}, California needs from {scope}.
Business facts: food={food}; alcohol={alcohol}; space={acquisition}; employees={employees}; exterior sign={sign}.
Use web_search to find official pages and web_fetch to read them. If web_search is unavailable or returns an error, use web_fetch directly on these official starting pages: {seeds}
Prefer official government sites (.gov). Use at most 4 tool calls.
Return ONLY JSON: {{"steps": [{{"id": short_snake_case, "name": plain-language step name, "agency": issuing agency,
"fee_usd": number (0 if the page says it's free, null if the page doesn't say), "duration_days": number of days for approval or processing (null if the page doesn't say), "depends_on": [ids of steps that must finish first],
"source_url": the official page you used, "gates_opening": false only if it can finish after opening day, "notes": one short sentence}}]}}
Include only steps from {scope} that apply to these business facts (for example, no alcohol license steps if alcohol=none; no change-of-ownership steps unless space=change_of_ownership).
If you cannot confirm something, leave it out rather than guess, and never invent fees or durations: use null."""

PLANNER_PROMPT = """You are the Planner agent. You get permit steps from city, county and state agents for one new business.
Fix the dependencies so the order is realistic (for example: zoning before building permit; County health plan approval before the building permit for food businesses; construction before final inspection; final inspection before the health permit; EIN before seller's permit and payroll registration).
Return ONLY JSON: {"depends_on": {"<step id>": ["<step id>", ...], ...}} using only ids from the list. Omit steps whose dependencies are already right."""

REMINDER_PROMPT = """You set up deadline reminders for an approved business launch plan. The owner asked for reminders.
Call start_automation once per reminder, at most 3 reminders, for the next key deadlines in the plan (steps marked critical first).
Each reminder input must be a short instruction like "Remind the owner: submit the County food facility plan check this week (step 3)". Use ISO 8601 start_at times in UTC, 9:00 AM on the day a week before each step starts (or tomorrow if that has passed).
Do not include the owner's address or any personal details in the reminder input. After scheduling, reply with one short confirmation listing the dates."""

SEEDS = {
    "city": ["https://www.sanjoseca.gov/businesses/development-services-permit-center/start-your-project/commercial-industrial-properties/restaurants-or-food-beverage-service",
             "https://www.sanjoseca.gov/your-government/departments-offices/finance/business-tax-registration/business-tax-rates"],
    "county": ["https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/submit-plan-review-restaurants-grocery-stores-and",
               "https://deh.santaclaracounty.gov/food-and-retail/compliance-retail-food-operations/restaurant-grocery-store-or-other-fixed-food"],
    "state": ["https://cdtfa.ca.gov/taxes-and-fees/faqseller.htm", "https://edd.ca.gov/en/payroll_taxes/am_i_required_to_register_as_an_employer",
              "https://www.abc.ca.gov/licensing/license-fees/application-fee-schedules/"],
}

AGENCIES = [
    ("City", "city", "the city (or the County, if the address is in unincorporated land): business license or tax registration, zoning, building, fire, sign and sidewalk permits"),
    ("County Health", "county", "the County Department of Environmental Health and County Clerk-Recorder: food facility plan check, health permit, change of ownership, fictitious business name"),
    ("State", "state", "the State of California and the federal government: Secretary of State entity filing, CDTFA seller's permit, EDD employer registration, ABC alcohol license, food safety certification, IRS EIN"),
]

# ---------------------------------------------------------------- helpers


def _status(agent: AgentSession, role: str, state: str, detail: str = "") -> None:
    """Frontend-visible progress (no personal data), shown in Flower Chat's Reasoning block."""
    agent.events.emit({"type": EVENT_STATUS, "role": role, "state": state, "detail": detail})
    icon = {"running": "…", "done": "✓", "tool": "  ↳"}.get(state, "•")
    line = f"{icon} {role}: using {detail}" if state == "tool" else f"{icon} {role}" + (f": {detail}" if detail else " working")
    agent.events.emit({"type": CHAT_PROGRESS, "delta": line + "\n"})


def say(agent: AgentSession, text: str) -> None:
    """Send answer text to the chat (and stdout for logs-free local runs)."""
    agent.events.emit({"type": CHAT_TEXT, "delta": text})
    print(text)


def _item_dict(item: Any) -> dict[str, Any]:
    return item.model_dump(exclude_none=True) if hasattr(item, "model_dump") else dict(item)


def run_role(
    agent: AgentSession,
    client: OpenAI,
    model: str,
    role: str,
    instructions: str,
    user_input: str,
    tool_names: list[str] | None = None,
) -> str:
    """One role = one model conversation. Tool calls are validated and capped at MAX_TOOL_ITERATIONS."""
    tools = agent.connectors.tools(tool_names) if tool_names else []
    allowed = {t["name"] for t in tools}
    items: list[Any] = [{"role": "user", "content": user_input}]
    for iteration in range(MAX_TOOL_ITERATIONS + 1):
        final_round = iteration == MAX_TOOL_ITERATIONS
        kwargs: dict[str, Any] = {"model": model, "instructions": instructions, "input": items}
        if tools and not final_round:
            kwargs["tools"] = tools
        elif tools:  # out of tool budget: ask for the answer with what it has
            items.append({"role": "user", "content": "Tool budget used up. Give your final JSON answer now from what you found."})
        response = client.responses.create(**kwargs)
        calls = [o for o in response.output if getattr(o, "type", "") == "function_call"]
        if not calls:
            return response.output_text or ""
        items.extend(_item_dict(o) for o in response.output)
        for call in calls:
            if call.name not in allowed:
                items.append({"type": "function_call_output", "call_id": call.call_id,
                              "output": json.dumps({"error": f"Tool '{call.name}' is not available to this agent."})})
                continue
            try:
                json.loads(call.arguments or "{}")
            except json.JSONDecodeError:
                items.append({"type": "function_call_output", "call_id": call.call_id, "output": json.dumps({"error": "Arguments were not valid JSON."})})
                continue
            _status(agent, role, "tool", call.name)
            try:
                items.append(agent.connectors.call({"name": call.name, "arguments": call.arguments, "call_id": call.call_id}))
            except Exception as err:  # pylint: disable=broad-exception-caught
                # A failed connector (network, provider not configured) must not end the run:
                # tell the model, which can try another source or answer from what it has.
                log.warning("%s: connector %s failed", role, call.name)
                items.append({"type": "function_call_output", "call_id": call.call_id,
                              "output": json.dumps({"error": f"{call.name} failed: {str(err)[:200]}"})})
    log.warning("%s hit the tool iteration cap", role)
    return ""


def load_history(agent: AgentSession) -> dict[str, Any]:
    """Latest plan and approval state from earlier runs in this conversation."""
    state: dict[str, Any] = {"plan": None, "profile": None, "approved": False}
    try:
        trace = agent.events.get_trace()
    except Exception:  # pylint: disable=broad-exception-caught
        log.warning("conversation history unavailable")
        return state
    for ev in trace:
        data = ev.get("data") or {}
        if ev.get("event") == EVENT_PLAN:
            state.update(plan=data.get("plan"), profile=data.get("profile"), approved=False)
        elif ev.get("event") == EVENT_APPROVED:
            state["approved"] = True
    return state


def is_approve(text: str) -> bool:
    return bool(re.fullmatch(r"\s*approve[d.! ]*\s*", text, re.I))


def wants_reminders(text: str) -> bool:
    return bool(re.search(r"\b(remind|reminder|reminders|deadline alerts?|notify me)\b", text, re.I))


def _agency_steps(agent: AgentSession, client: OpenAI, model: str, profile: dict[str, Any]) -> list[list[dict[str, Any]]]:
    """Run City, County Health and State agents; fall back to built-in rules if a search comes back empty."""
    kind = {"cafe": "café", "restaurant": "restaurant", "retail_boutique": "retail boutique"}.get(profile.get("business_type"), "business")
    groups = []
    for role, level, scope in AGENCIES:
        _status(agent, f"{role} agent", "running")
        # Only city/county-level facts go to web search, never the street address.
        prompt = AGENCY_PROMPT.format(
            role=role, kind=kind, city=profile.get("city", "San José"), county=profile.get("county", "Santa Clara County"),
            scope=scope, seeds=", ".join(SEEDS[level]), food=profile.get("food_service"), alcohol=profile.get("alcohol"), acquisition=profile.get("acquisition"),
            employees=profile.get("employees"), sign=profile.get("exterior_sign"))
        steps: list[dict[str, Any]] = []
        try:
            reply = run_role(agent, client, model, f"{role} agent", prompt, "Find the requirements and return the JSON.", ["web_search", "web_fetch"])
            data = extract_json(reply) or {}
            raw = data.get("steps", []) if isinstance(data, dict) else []
            steps = [s for s in (clean_step(r, level) for r in raw) if s]
        except Exception:  # pylint: disable=broad-exception-caught
            log.warning("%s agent failed; using fallback rules", role)
        if len(steps) < 2 and _covered_by_rules(profile):
            steps = [clean_step(r, r["level"]) | {"verified_rule": r.get("verified", False)} for r in fallback_steps(profile, level)]
            _status(agent, f"{role} agent", "done", f"{len(steps)} steps (from built-in rules)")
        else:
            _status(agent, f"{role} agent", "done", f"{len(steps)} steps found")
        groups.append([s for s in steps if s])
    return groups


def _covered_by_rules(profile: dict[str, Any]) -> bool:
    city = (profile.get("city") or "").lower().replace("é", "e")
    return "san jose" in city or not city


def _plan(agent: AgentSession, client: OpenAI, model: str, profile: dict[str, Any]) -> dict[str, Any]:
    steps = merge_steps(_agency_steps(agent, client, model, profile))
    # Guardrails on agent output: drop steps that contradict the owner's facts, fill unknown
    # fees and times from the built-in rules (flagged as estimates), and add core steps an agent missed.
    dropped = [s for s in steps if not is_relevant(s, profile)]
    steps = [enrich(s) for s in steps if is_relevant(s, profile)]
    if _covered_by_rules(profile):
        added = [clean_step(r, r["level"]) | {"added_from_rules": True} for r in missing_essentials(steps, profile)]
        steps = merge_steps([steps, [a for a in added if a]])  # the Planner then wires their dependencies
    _status(agent, "Guardrails", "done", f"removed {len(dropped)} step(s) that don't apply; filled unstated fees and times from rules")
    # Construction time is the owner's work, not a permit, but inspections wait on it.
    if not any(s["level"] == "work" for s in steps) and profile.get("acquisition") != "change_of_ownership":
        builds = [s for s in steps if "building permit" in s["name"].lower()]
        if builds:
            steps.append({"id": "build_out", "level": "work", "name": "Construction and fit-out (your contractor)", "agency": "Your contractor",
                          "fee_usd": 0, "duration_days": 35, "depends_on": [builds[0]["id"]], "source_url": "", "gates_opening": True, "notes": ""})

    _status(agent, "Planner", "running")
    listing = [{"id": s["id"], "name": s["name"], "level": s["level"], "depends_on": s["depends_on"]} for s in steps]
    try:
        reply = run_role(agent, client, model, "Planner", PLANNER_PROMPT, json.dumps(listing))
        fixes = (extract_json(reply) or {}).get("depends_on", {})
        ids = {s["id"] for s in steps}
        for s in steps:
            if isinstance(fixes.get(s["id"]), list):
                s["depends_on"] = [d for d in fixes[s["id"]] if d in ids and d != s["id"]]
    except Exception:  # pylint: disable=broad-exception-caught
        log.warning("planner failed; keeping agency dependencies")
    plan = schedule(steps, date.today())
    _status(agent, "Planner", "done", f"opening {plan['open_date']}, {len(steps)} steps")

    _status(agent, "Checker", "running")
    check_sources(plan["steps"])
    unverified = sum(1 for s in plan["steps"] if s["status"] == "Needs verification")
    _status(agent, "Checker", "done", f"{unverified} step(s) need verification")
    return plan


def _apply_review(agent: AgentSession, client: OpenAI, model: str, plan: dict[str, Any], text: str) -> dict[str, Any]:
    """Apply a human correction, then re-schedule and re-check. Corrected steps are marked as human-reviewed."""
    steps = plan["steps"]
    listing = [{k: s.get(k) for k in ("order", "name", "agency", "fee_usd", "duration_days", "source_url", "status")} for s in steps]
    edits = (extract_json(run_role(agent, client, model, "Reviewer agent", REVIEWER_PROMPT,
                                   f"Steps: {json.dumps(listing)}\n\nHuman message: {text}")) or {}).get("edits", [])
    by_order = {s["order"]: s for s in steps}
    removed: set[int] = set()
    for e in edits if isinstance(edits, list) else []:
        s = by_order.get(e.get("order")) if isinstance(e, dict) else None
        if not s:
            continue
        if e.get("remove"):
            removed.add(s["order"])
            continue
        for k in ("name", "agency", "source_url"):
            if isinstance(e.get(k), str) and e[k].strip():
                s[k] = e[k].strip()
        for k in ("fee_usd", "duration_days"):
            if isinstance(e.get(k), (int, float)) and e[k] >= 0:
                s[k] = round(e[k]) if k == "fee_usd" else max(1, round(e[k]))
                s["estimated"] = False  # a number a person supplied is no longer an estimate
        s["reviewed_by_human"] = True
    kept = [s for s in steps if s["order"] not in removed]
    new_plan = schedule(kept, date.today())
    check_sources(new_plan["steps"])
    for s in new_plan["steps"]:
        if s.get("reviewed_by_human") and s["status"] == "Needs verification":
            s["status"] = "Confirmed by reviewer"
    return new_plan


def _reminders(agent: AgentSession, client: OpenAI, model: str, plan: dict[str, Any]) -> str:
    upcoming = [{"order": s["order"], "name": s["name"], "start_date": s["start_date"], "critical": s["critical"]}
                for s in plan["steps"] if s["start_date"] >= date.today().isoformat()][:8]
    now = datetime.now(timezone.utc).isoformat(timespec="minutes")
    return run_role(agent, client, model, "Reminders", REMINDER_PROMPT,
                    f"Current time (UTC): {now}\nUpcoming steps: {json.dumps(upcoming)}", ["start_automation"])


# ---------------------------------------------------------------- entry point


@app.main()
def main(agent: AgentSession, context: Context) -> None:
    """Comply Cofounder: plan, wait for approval, then offer reminders."""
    try:
        _main(agent, context)
    except Exception as err:  # pylint: disable=broad-exception-caught
        log.warning("run failed: %s", type(err).__name__)
        agent.events.emit({"type": "error", "message": f"Comply Cofounder hit an error ({type(err).__name__}). Please try again."})
        raise
    agent.events.emit({"type": CHAT_DONE})


def _main(agent: AgentSession, context: Context) -> None:
    model = os.environ.get("COMPLY_MODEL") or (str(context.run_config.get("model", DEFAULT_MODEL)) if context.run_config else DEFAULT_MODEL)
    client = OpenAI(base_url=os.environ["FLWR_RUNTIME_BASE_URL"], api_key=os.environ["FLWR_RUNTIME_API_KEY"], max_retries=0)
    text = (agent.prompt or "").strip()
    history = load_history(agent)

    # 1) Approval of the plan shown last turn.
    if history["plan"] and not history["approved"] and is_approve(text):
        agent.events.emit({"type": EVENT_APPROVED, "open_date": history["plan"]["open_date"]})
        say(agent, f"✅ Plan approved. Target opening: {history['plan']['open_date']}.\n\n"
              "Want deadline reminders for the key steps? Reply \"remind me\" and I'll schedule them.")
        return

    # 2) Reminders, only after approval.
    if wants_reminders(text):
        if not history["approved"]:
            say(agent, "I can set reminders once you've approved a plan. " + (APPROVAL_LINE if history["plan"] else "Tell me what you're opening and where to start."))
            return
        _status(agent, "Reminders", "running")
        say(agent, _reminders(agent, client, model, history["plan"]) or "I couldn't schedule reminders right now. Try again in a moment.")
        _status(agent, "Reminders", "done")
        return

    # 3) A human correcting a flagged step in the plan shown last turn.
    if history["plan"] and not history["approved"] and re.search(r"\bsteps?\s*#?\d+|^\s*(fix|correct|update)\b", text, re.I):
        _status(agent, "Reviewer agent", "running")
        plan = _apply_review(agent, client, model, history["plan"], text)
        _status(agent, "Reviewer agent", "done", "correction applied")
        agent.events.emit({"type": EVENT_PLAN, "status": "awaiting_approval", "profile": history["profile"], "plan": plan})
        say(agent, format_plan(history["profile"] or {}, plan) + "\n\n" + APPROVAL_LINE)
        return

    # 4) New plan or a change to the last one.
    _status(agent, "Intake agent", "running")
    previous = f"Previous profile: {json.dumps(history['profile'])}\n\n" if history["profile"] else ""
    profile = extract_json(run_role(agent, client, model, "Intake agent", INTAKE_PROMPT, f"{previous}Owner's message: {text}")) or {}
    if not isinstance(profile, dict) or profile.get("question") or not profile.get("business_type"):
        question = (profile.get("question") if isinstance(profile, dict) else None) or "What are you opening (café, restaurant or boutique), and at what address?"
        _status(agent, "Intake agent", "done", "needs one answer")
        say(agent, question)
        return
    _status(agent, "Intake agent", "done", f"{profile.get('business_type')} profile ready")

    if profile.get("address") and profile.get("address") != (history["profile"] or {}).get("address"):
        _status(agent, "Jurisdiction agent", "running")
        juris = extract_json(run_role(agent, client, model, "Jurisdiction agent", JURISDICTION_PROMPT,
                                      f"Address: {profile['address']}", ["web_fetch"])) or {}
        if isinstance(juris, dict) and juris.get("kind") in {"city", "unincorporated", "out_of_area"}:
            profile["jurisdiction"] = juris["kind"]
            profile["city"] = juris.get("city") or ("Unincorporated " + juris.get("county", "county") if juris["kind"] == "unincorporated" else profile.get("city"))
            profile["county"] = juris.get("county") or profile.get("county")
        _status(agent, "Jurisdiction agent", "done", f"rules from {profile.get('city') or 'unknown'}")

    plan = _plan(agent, client, model, profile)
    agent.events.emit({"type": EVENT_PLAN, "status": "awaiting_approval", "profile": profile, "plan": plan})
    say(agent, format_plan(profile, plan) + "\n\n" + APPROVAL_LINE)
