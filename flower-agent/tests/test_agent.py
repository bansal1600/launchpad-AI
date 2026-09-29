"""Offline tests: fake model + fake Flower session, so the full flow runs without an API key."""

import json
from types import SimpleNamespace

import pytest

from agent import agent_app
from agent.planning import check_sources, schedule
from agent.rules import fallback_steps
from flwr.supercore.task_process.connector.registry import get_connector_tools


# ---------------------------------------------------------------- fakes

def text_reply(obj):
    return SimpleNamespace(output=[SimpleNamespace(type="message", model_dump=lambda **_: {"type": "message"})],
                           output_text=obj if isinstance(obj, str) else json.dumps(obj))


def tool_reply(name, args, call_id="c1"):
    call = SimpleNamespace(type="function_call", name=name, arguments=json.dumps(args), call_id=call_id,
                           model_dump=lambda **_: {"type": "function_call", "name": name, "arguments": json.dumps(args), "call_id": call_id})
    return SimpleNamespace(output=[call], output_text="")


class FakeModel:
    """Answers by role (recognised from the system prompt). Each role calls its tool once, then answers."""

    def __init__(self, script):
        self.script, self.calls = script, []
        self.responses = SimpleNamespace(create=self.create)

    def create(self, **kw):
        role = next(r for r in self.script if r in kw["instructions"])
        self.calls.append((role, [t["name"] for t in kw.get("tools", [])]))
        tool, answer = self.script[role]
        already = any(isinstance(i, dict) and i.get("type") == "function_call_output" for i in kw["input"])
        return tool_reply(*tool) if tool and not already else text_reply(answer)


class FakeSession:
    def __init__(self, prompt, trace=None):
        self.prompt, self.emitted, self.tool_calls = prompt, [], []
        self._trace = trace or []
        self.connectors = SimpleNamespace(tools=lambda names: [t for n in names for t in get_connector_tools(n)], call=self._call)
        self.events = SimpleNamespace(emit=self.emitted.append, get_trace=lambda: self._trace)

    def _call(self, call):
        self.tool_calls.append(call["name"])
        return {"type": "function_call_output", "call_id": call["call_id"], "output": json.dumps({"ok": True})}

    def trace_for_next_turn(self):
        return self._trace + [{"event": e["type"], "data": e} for e in self.emitted]


CITY = {"steps": [
    {"id": "zoning", "name": "Zoning check", "agency": "San José Planning", "fee_usd": 0, "duration_days": 5, "depends_on": [], "source_url": "https://www.sanjoseca.gov/zoning"},
    {"id": "building_permit", "name": "Building permit", "agency": "San José PBCE", "fee_usd": 6000, "duration_days": 45, "depends_on": ["zoning"], "source_url": "https://www.sjeconomy.com/srp"},
]}
COUNTY = {"steps": [
    {"id": "plan_check", "name": "Food facility plan check", "agency": "County DEH", "fee_usd": 2400, "duration_days": 42, "depends_on": [], "source_url": "https://deh.santaclaracounty.gov/plan"},
    {"id": "health_permit", "name": "Health permit to operate", "agency": "County DEH", "fee_usd": 1100, "duration_days": 7, "depends_on": [], "source_url": "https://deh.santaclaracounty.gov/permit"},
]}
STATE = {"steps": [
    {"id": "ein", "name": "Federal tax ID (EIN)", "agency": "IRS", "fee_usd": 0, "duration_days": 1, "source_url": "https://www.irs.gov/ein"},
    {"id": "sellers_permit", "name": "Seller's permit", "agency": "CDTFA", "fee_usd": 0, "duration_days": 1, "depends_on": ["ein"], "source_url": "https://cdtfa.ca.gov/x"},
]}
SCRIPT = {
    "Intake agent": (None, {"business_type": "cafe", "address": "87 N San Pedro St, San Jose, CA 95110", "city": "San Jose", "county": "Santa Clara",
                            "food_service": "prepared_food", "alcohol": "none", "acquisition": "second_generation", "entity_type": "llc",
                            "employees": 4, "exterior_sign": True, "question": None}),
    "Jurisdiction agent": (("web_fetch", {"url": "https://geocoding.geo.census.gov/..."}), {"kind": "city", "city": "San José", "county": "Santa Clara County"}),
    "City agent": (("web_search", {"query": "San Jose cafe permits"}), CITY),
    "County Health agent": (("web_search", {"query": "Santa Clara County food facility plan check"}), COUNTY),
    "State agent": (("web_search", {"query": "California seller's permit"}), STATE),
    "Planner agent": (None, {"depends_on": {"building_permit": ["zoning", "plan_check"], "health_permit": ["build_out"]}}),
    "Reviewer agent": (None, {"edits": [{"order": 0, "fee_usd": 5500, "source_url": "https://www.sanjoseca.gov/building"}]}),
    "set up deadline reminders": (("start_automation", {"input": "Remind the owner: submit plan check", "start_at": "2026-10-01T16:00:00+00:00"}), "Scheduled 1 reminder."),
}


@pytest.fixture
def run(monkeypatch):
    monkeypatch.setenv("FLWR_RUNTIME_BASE_URL", "http://fake")
    monkeypatch.setenv("FLWR_RUNTIME_API_KEY", "fake")
    model = FakeModel(SCRIPT)
    monkeypatch.setattr(agent_app, "OpenAI", lambda **_: model)

    def _run(prompt, trace=None):
        session = FakeSession(prompt, trace)
        agent_app.main(session, SimpleNamespace(run_config={"model": "test-model"}))
        return session, model
    return _run


# ---------------------------------------------------------------- flow

def test_full_flow_plan_then_approve_then_reminders(run, capsys):
    s1, model = run("Café at 87 N San Pedro St, San Jose")
    out = capsys.readouterr().out
    roles = [c[0] for c in model.calls]
    for role in ["Intake agent", "Jurisdiction agent", "City agent", "County Health agent", "State agent", "Planner agent"]:
        assert role in roles
    assert out.strip().endswith(agent_app.APPROVAL_LINE)
    # Flower Chat sees the plan text, the agents' progress, and a completion event.
    types = [e["type"] for e in s1.emitted]
    assert agent_app.CHAT_TEXT in types and agent_app.CHAT_PROGRESS in types and types[-1] == agent_app.CHAT_DONE
    progress = "".join(e["delta"] for e in s1.emitted if e["type"] == agent_app.CHAT_PROGRESS)
    assert "✓ City agent" in progress and "↳ City agent: using web_search" in progress
    assert "Needs verification" in out  # sjeconomy.com is not a .gov source
    plan_events = [e for e in s1.emitted if e["type"] == agent_app.EVENT_PLAN]
    assert plan_events and plan_events[0]["status"] == "awaiting_approval"
    # Planner's dependency fixes are applied: health permit waits for construction.
    steps = {s["id"]: s for s in plan_events[0]["plan"]["steps"]}
    assert steps["health_permit"]["start_day"] >= steps["build_out"]["end_day"]

    # Reminders are refused before approval.
    s2, _ = run("remind me", s1.trace_for_next_turn())
    assert "once you've approved" in capsys.readouterr().out
    assert "start_automation" not in s2.tool_calls

    s3, _ = run("APPROVE", s1.trace_for_next_turn())
    assert "Plan approved" in capsys.readouterr().out
    assert any(e["type"] == agent_app.EVENT_APPROVED for e in s3.emitted)

    s4, _ = run("yes please remind me", s3.trace_for_next_turn())
    assert s4.tool_calls == ["start_automation"]
    assert "Scheduled" in capsys.readouterr().out


def test_human_fixes_a_flagged_step(run, capsys):
    s1, _ = run("Café at 87 N San Pedro St, San Jose")
    capsys.readouterr()
    plan = next(e for e in s1.emitted if e["type"] == agent_app.EVENT_PLAN)["plan"]
    building = next(s for s in plan["steps"] if s["id"] == "building_permit")
    SCRIPT["Reviewer agent"][1]["edits"][0]["order"] = building["order"]
    s2, _ = run(f"Step {building['order']}: fee is $5,500, source https://www.sanjoseca.gov/building", s1.trace_for_next_turn())
    new = next(e for e in s2.emitted if e["type"] == agent_app.EVENT_PLAN)["plan"]
    fixed = next(s for s in new["steps"] if s["id"] == "building_permit")
    assert fixed["fee_usd"] == 5500 and fixed["status"] == "Official source" and fixed["reviewed_by_human"]
    assert not fixed.get("estimated")


def test_intake_asks_one_question_when_unclear(run, capsys, monkeypatch):
    monkeypatch.setitem(SCRIPT, "Intake agent", (None, {"question": "What's the address?", "business_type": "cafe"}))
    session, model = run("I want to open a café")
    assert capsys.readouterr().out.strip() == "What's the address?"
    assert [c[0] for c in model.calls] == ["Intake agent"]
    assert not any(e["type"] == agent_app.EVENT_PLAN for e in session.emitted)


# ---------------------------------------------------------------- safety

def test_tools_outside_the_agents_list_are_blocked(monkeypatch):
    session = FakeSession("x")
    model = SimpleNamespace(responses=SimpleNamespace(create=lambda **kw: text_reply("done") if any(
        isinstance(i, dict) and i.get("type") == "function_call_output" for i in kw["input"]) else tool_reply("start_automation", {"input": "x", "start_at": "y"})))
    agent_app.run_role(session, model, "m", "City agent", "find", "go", ["web_search"])
    assert session.tool_calls == []  # never executed


def test_tool_loop_is_capped():
    session = FakeSession("x")
    count = {"n": 0}

    def create(**kw):
        count["n"] += 1
        return tool_reply("web_search", {"query": "q"}, f"c{count['n']}") if "tools" in kw else text_reply("{}")
    agent_app.run_role(session, SimpleNamespace(responses=SimpleNamespace(create=create)), "m", "City agent", "find", "go", ["web_search"])
    assert len(session.tool_calls) == agent_app.MAX_TOOL_ITERATIONS
    assert count["n"] == agent_app.MAX_TOOL_ITERATIONS + 1


def test_no_personal_data_in_logs_or_status(run, caplog):
    with caplog.at_level("DEBUG", logger="comply_cofounder"):
        session, _ = run("Café at 87 N San Pedro St, San Jose")
    statuses = json.dumps([e for e in session.emitted if e["type"] in (agent_app.EVENT_STATUS, agent_app.CHAT_PROGRESS)])
    assert "San Pedro" not in statuses and "San Pedro" not in caplog.text


# ---------------------------------------------------------------- planning + rules

def test_fallback_rules_and_schedule():
    profile = {"business_type": "cafe", "food_service": "prepared_food", "alcohol": "beer_wine", "acquisition": "second_generation", "employees": 4}
    steps = [dict(s) for s in fallback_steps(profile)]
    ids = {s["id"] for s in steps}
    assert {"deh_plan_check", "sj_building_permit", "abc_type41", "cdtfa_sellers_permit"} <= ids
    plan = schedule(steps)
    check_sources(plan["steps"])
    by = {s["id"]: s for s in plan["steps"]}
    for s in plan["steps"]:
        for d in s["depends_on"]:
            assert s["start_day"] >= by[d]["end_day"]
    assert not by["sj_sign_permit"]["critical"]  # signs never set the opening date
    assert by["sj_building_permit"]["status"] == "Needs verification"  # sjeconomy.com is not .gov
    assert by["deh_plan_check"]["status"] == "Official source"


def test_failed_connector_does_not_end_the_run():
    session = FakeSession("x")
    session.connectors.call = lambda call: (_ for _ in ()).throw(RuntimeError("provider down"))
    replies = iter([tool_reply("web_fetch", {"url": "https://example.gov"}), text_reply('{"steps": []}')])
    out = agent_app.run_role(session, SimpleNamespace(responses=SimpleNamespace(create=lambda **kw: next(replies))), "m", "City agent", "find", "go", ["web_fetch"])
    assert out == '{"steps": []}'


def test_guardrails_fill_unknowns_and_drop_irrelevant_steps():
    from agent.planning import clean_step
    from agent.rules import enrich, is_relevant, missing_essentials
    profile = {"business_type": "cafe", "food_service": "prepared_food", "alcohol": "none", "acquisition": "second_generation"}
    plan_check = enrich(clean_step({"name": "Food facility plan check", "duration_days": None, "fee_usd": 0}, "county"))
    assert plan_check["duration_days"] == 42 and plan_check["fee_usd"] == 2400 and plan_check["estimated"]
    stated = enrich(clean_step({"name": "Seller's permit", "duration_days": 3, "fee_usd": 0}, "state"))
    assert stated["duration_days"] == 3 and not stated.get("estimated")  # agency value kept when plausible
    assert not is_relevant(clean_step({"name": "Determine ABC alcoholic beverage license need"}, "state"), profile)
    assert not is_relevant(clean_step({"name": "Change of Ownership Application"}, "county"), profile)
    assert is_relevant(clean_step({"name": "Fire life-safety inspection"}, "city"), profile)
    missing = {r["id"] for r in missing_essentials([clean_step({"name": "Zoning check"}, "city")], profile)}
    assert {"deh_plan_check", "sj_building_permit", "deh_permit_to_operate"} <= missing
    assert "abc_type41" not in missing and "deh_change_of_ownership" not in missing
