"""TruckComply engine.

Pure Python. No LLM calls, no network requests, no external services.
Everything here reads from data/mock_compliance.json and
data/sample_profiles.json and turns it into requirements, restrictions,
and a scheduled go-live roadmap for a given set of inputs.
"""

import json
import math
from collections import deque
from datetime import timedelta

COMPLIANCE_PATH = "data/mock_compliance.json"
PROFILES_PATH = "data/sample_profiles.json"

SELL_WHERE_KEYS = ["street", "markets", "events", "private_lots", "catering"]


# ---------------------------------------------------------------------------
# Loading
# ---------------------------------------------------------------------------

def load_data(path=COMPLIANCE_PATH):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_profiles(path=PROFILES_PATH):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)["profiles"]


# ---------------------------------------------------------------------------
# Condition mapping
# ---------------------------------------------------------------------------

def build_conditions(inputs):
    """Map raw form inputs to the condition keys used by applies_if lists."""
    sell_where = set(inputs.get("sell_where", []))
    return {
        "always": True,
        "hazardous_food": bool(inputs.get("hazardous_food")),
        "alcohol": bool(inputs.get("alcohol")),
        "propane_generator": bool(inputs.get("propane_generator")),
        "packaged": bool(inputs.get("packaged")),
        "late_night": bool(inputs.get("late_night")),
        "multi_jurisdiction": bool(inputs.get("multi_jurisdiction")),
        "employees": inputs.get("employees") in ("1-5", "6+"),
        "llc_or_partnership": inputs.get("structure") in ("LLC", "partnership"),
        "street": "street" in sell_where,
        "markets": "markets" in sell_where,
        "events": "events" in sell_where,
        "private_lots": "private_lots" in sell_where,
        "catering": "catering" in sell_where,
    }


def applies(applies_if, conditions):
    """True if applies_if contains 'always' or any true condition key."""
    return any(conditions.get(key, False) for key in applies_if)


# ---------------------------------------------------------------------------
# Requirements
# ---------------------------------------------------------------------------

def _sort_requirements_by_prereq(included, all_reqs):
    """Topological sort by prereq. Missing (filtered-out) prereqs don't
    block ordering but are flagged on the item."""
    all_by_id = {r["id"]: r for r in all_reqs}
    included_ids = {r["id"] for r in included}
    incl_by_id = {r["id"]: r for r in included}

    graph = {rid: [] for rid in included_ids}
    indegree = {rid: 0 for rid in included_ids}
    missing_map = {}

    for r in included:
        prereqs = r.get("prereq", [])
        missing_map[r["id"]] = [pid for pid in prereqs if pid not in included_ids]
        for pid in prereqs:
            if pid in included_ids:
                graph[pid].append(r["id"])
                indegree[r["id"]] += 1

    queue = deque(sorted(rid for rid, d in indegree.items() if d == 0))
    order = []
    indeg_copy = dict(indegree)
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in sorted(graph[node]):
            indeg_copy[nxt] -= 1
            if indeg_copy[nxt] == 0:
                queue.append(nxt)
    # Any leftover (shouldn't happen without cycles in the data) keeps a
    # deterministic order instead of being dropped.
    remaining = sorted(rid for rid in included_ids if rid not in order)
    order.extend(remaining)

    result = []
    for rid in order:
        r = dict(incl_by_id[rid])
        r["prereq_names"] = [
            all_by_id[pid]["name"] if pid in all_by_id else pid for pid in r.get("prereq", [])
        ]
        r["missing_prereqs"] = missing_map[rid]
        r["missing_prereq_names"] = [
            all_by_id[pid]["name"] if pid in all_by_id else pid for pid in missing_map[rid]
        ]
        result.append(r)
    return result


def get_requirements(data, conditions):
    all_reqs = data["requirements"]
    included = [r for r in all_reqs if applies(r.get("applies_if", []), conditions)]
    return _sort_requirements_by_prereq(included, all_reqs)


def attach_restrictions(requirements, restrictions):
    """Attach each restriction to the requirements it lists in 'related'."""
    by_req = {}
    for r in restrictions:
        for rid in r.get("related", []):
            by_req.setdefault(rid, []).append(r)
    for req in requirements:
        req["restrictions"] = by_req.get(req["id"], [])
    return requirements


# ---------------------------------------------------------------------------
# Restrictions
# ---------------------------------------------------------------------------

def get_restrictions(data, conditions):
    return [r for r in data["restrictions"] if applies(r.get("applies_if", []), conditions)]


def restrictions_by_category(restrictions):
    groups = {}
    for r in restrictions:
        groups.setdefault(r.get("category", "Other"), []).append(r)
    return groups


def restrictions_by_channel(restrictions, sell_where):
    return {ch: [r for r in restrictions if ch in r.get("applies_if", [])] for ch in sell_where}


def top_mistakes(restrictions):
    return [r for r in restrictions if r.get("severity") == "common violation"]


# ---------------------------------------------------------------------------
# Summary helpers
# ---------------------------------------------------------------------------

def level_counts(requirements):
    counts = {}
    for r in requirements:
        counts[r["level"]] = counts.get(r["level"], 0) + 1
    return counts


def severity_counts(restrictions):
    counts = {}
    for r in restrictions:
        counts[r["severity"]] = counts.get(r["severity"], 0) + 1
    return counts


def cost_summary(requirements):
    """Sum cost_min/cost_max per cost_type, as found in the data."""
    summary = {}
    for r in requirements:
        ct = r.get("cost_type", "unknown")
        bucket = summary.setdefault(ct, {"min": 0, "max": 0})
        bucket["min"] += r.get("cost_min", 0)
        bucket["max"] += r.get("cost_max", 0)
    return summary


def renewals_table(requirements):
    return [{"name": r["name"], "renewal": r["renewal"], "cost_type": r["cost_type"]} for r in requirements]


# ---------------------------------------------------------------------------
# Roadmap scheduling
# ---------------------------------------------------------------------------

NON_BLOCKING_STEP_IDS = ("g14", "g15")
GO_LIVE_STEP_ID = "g19"


def compute_roadmap(data, conditions, start_date):
    roadmap = data["go_live_roadmap"]
    all_steps = roadmap["steps"]
    phases = roadmap["phases"]
    phase_names = {p["id"]: p["name"] for p in phases}

    included = [s for s in all_steps if applies(s.get("applies_if", []), conditions)]
    included_ids = {s["id"] for s in included}
    step_by_id = {s["id"]: s for s in included}

    # Ignore depends_on entries that were filtered out.
    filtered_deps = {
        s["id"]: [d for d in s.get("depends_on", []) if d in included_ids] for s in included
    }

    # Topological order over the included steps only.
    indegree = {sid: 0 for sid in included_ids}
    graph = {sid: [] for sid in included_ids}
    for sid, deps in filtered_deps.items():
        for d in deps:
            graph[d].append(sid)
            indegree[sid] += 1
    queue = deque(sorted(sid for sid, d in indegree.items() if d == 0))
    order = []
    indeg_copy = dict(indegree)
    while queue:
        node = queue.popleft()
        order.append(node)
        for nxt in sorted(graph[node]):
            indeg_copy[nxt] -= 1
            if indeg_copy[nxt] == 0:
                queue.append(nxt)
    remaining = sorted(sid for sid in included_ids if sid not in order)
    order.extend(remaining)

    # Schedule fast (days_min) and slow (days_max) cases.
    schedule = {}
    for sid in order:
        s = step_by_id[sid]
        deps = filtered_deps[sid]
        if not deps:
            fast_start, fast_driver = 0, None
            slow_start, slow_driver = 0, None
        else:
            fast_start, fast_driver = max((schedule[d]["fast_finish"], d) for d in deps)
            slow_start, slow_driver = max((schedule[d]["slow_finish"], d) for d in deps)
        schedule[sid] = {
            "fast_start": fast_start,
            "fast_finish": fast_start + s["days_min"],
            "fast_driver": fast_driver,
            "slow_start": slow_start,
            "slow_finish": slow_start + s["days_max"],
            "slow_driver": slow_driver,
        }

    # Critical path: backtrack the slow-case drivers from g19.
    critical_path = []
    cursor = GO_LIVE_STEP_ID if GO_LIVE_STEP_ID in schedule else None
    while cursor:
        critical_path.append(cursor)
        cursor = schedule[cursor]["slow_driver"]
    critical_path.reverse()
    critical_set = set(critical_path)

    g19_fast = schedule.get(GO_LIVE_STEP_ID, {}).get("fast_finish")
    g19_slow = schedule.get(GO_LIVE_STEP_ID, {}).get("slow_finish")

    separate_finish = {}
    for sid in NON_BLOCKING_STEP_IDS:
        if sid in schedule:
            separate_finish[sid] = {
                "name": step_by_id[sid]["name"],
                "fast_finish": schedule[sid]["fast_finish"],
                "slow_finish": schedule[sid]["slow_finish"],
            }

    req_names = {r["id"]: r["name"] for r in data["requirements"]}

    display_steps = []
    for sid in order:
        s = step_by_id[sid]
        sched = schedule[sid]
        display_steps.append({
            "id": sid,
            "phase_id": s["phase"],
            "phase_name": phase_names.get(s["phase"], s["phase"]),
            "name": s["name"],
            "what_to_do": s["what_to_do"],
            "owner": s["owner"],
            "days_min": s["days_min"],
            "days_max": s["days_max"],
            "fast_start": sched["fast_start"],
            "fast_finish": sched["fast_finish"],
            "slow_start": sched["slow_start"],
            "slow_finish": sched["slow_finish"],
            "fast_start_date": start_date + timedelta(days=sched["fast_start"]),
            "fast_finish_date": start_date + timedelta(days=sched["fast_finish"]),
            "slow_start_date": start_date + timedelta(days=sched["slow_start"]),
            "slow_finish_date": start_date + timedelta(days=sched["slow_finish"]),
            "depends_on_ids": filtered_deps[sid],
            "depends_on_names": [step_by_id[d]["name"] for d in filtered_deps[sid]],
            "requirement_ids": s.get("requirement_ids", []),
            "requirement_names": [req_names.get(rid, rid) for rid in s.get("requirement_ids", [])],
            "tip": s["tip"],
            "is_critical": sid in critical_set,
            "is_non_blocking": sid in NON_BLOCKING_STEP_IDS,
        })

    weeks_min = math.ceil(g19_fast / 7) if g19_fast is not None else None
    weeks_max = math.ceil(g19_slow / 7) if g19_slow is not None else None

    return {
        "phases": phases,
        "steps": display_steps,
        "order": order,
        "critical_path_ids": critical_path,
        "critical_path_names": [step_by_id[sid]["name"] for sid in critical_path],
        "g19_fast_finish": g19_fast,
        "g19_slow_finish": g19_slow,
        "weeks_min": weeks_min,
        "weeks_max": weeks_max,
        "separate_finish": separate_finish,
        "start_date": start_date,
    }


def parallel_now(display_steps, done_ids):
    """Steps not yet done whose dependencies are all done (or have none)."""
    return [
        s for s in display_steps
        if s["id"] not in done_ids and all(d in done_ids for d in s["depends_on_ids"])
    ]


# ---------------------------------------------------------------------------
# Jurisdiction check
# ---------------------------------------------------------------------------

def is_known_jurisdiction(city, state, profiles):
    known = {(p["city"].strip().lower(), p["state"].strip().lower()) for p in profiles}
    return (city.strip().lower(), state.strip().lower()) in known
