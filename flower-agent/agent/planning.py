"""Deterministic planning helpers: merge, schedule, critical path, source check, formatting.

The model roles decide *what* the steps are; this module does the arithmetic so the
opening date, costs and critical path are exact and repeatable.
"""

from __future__ import annotations

import json
import re
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlparse

Step = dict[str, Any]

OFFICIAL_SUFFIXES = (".gov", ".ca.us", ".mil")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")[:48] or "step"


def extract_json(text: str) -> Any:
    """Pull the first JSON object or array out of a model reply."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.+?)```", text, re.S)
    if fence:
        text = fence.group(1).strip()
    for opener, closer in (("{", "}"), ("[", "]")):
        start, end = text.find(opener), text.rfind(closer)
        if start != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                continue
    return None


def clean_step(raw: Any, level: str) -> Step | None:
    """Validate one step from an agency agent; drop anything malformed."""
    if not isinstance(raw, dict) or not str(raw.get("name", "")).strip():
        return None

    def num(v: Any, default: float) -> float:
        try:
            return max(0.0, float(v))
        except (TypeError, ValueError):
            return default

    return {
        "id": slug(str(raw.get("id") or raw["name"])),
        "level": level,
        "name": str(raw["name"]).strip()[:120],
        "agency": str(raw.get("agency", "")).strip()[:120],
        "fee_usd": round(num(raw.get("fee_usd"), 0)),
        "duration_days": max(1, round(num(raw.get("duration_days"), 7))),
        "depends_on": [slug(str(d)) for d in raw.get("depends_on", []) if str(d).strip()],
        "source_url": str(raw.get("source_url", "")).strip(),
        "gates_opening": raw.get("gates_opening", True) is not False,
        "notes": str(raw.get("notes", "")).strip()[:300],
    }


def is_official(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return bool(host) and host.endswith(OFFICIAL_SUFFIXES)


def check_sources(steps: list[Step]) -> list[Step]:
    """Checker: any step without an official government source needs verification."""
    for s in steps:
        if s.get("status") == "Confirmed by reviewer":
            continue
        if s.get("level") == "work":
            s["status"] = "Your work"
        else:
            s["status"] = "Official source" if is_official(s.get("source_url", "")) else "Needs verification"
    return steps


def merge_steps(groups: list[list[Step]]) -> list[Step]:
    """Combine agency results, dropping duplicates by id or name."""
    seen_ids: set[str] = set()
    seen_names: set[str] = set()
    out: list[Step] = []
    for group in groups:
        for s in group:
            key = slug(s["name"])
            if s["id"] in seen_ids or key in seen_names:
                continue
            seen_ids.add(s["id"])
            seen_names.add(key)
            out.append(s)
    return out


def schedule(steps: list[Step], start: date | None = None) -> dict[str, Any]:
    """Order by dependency, compute start/end days, critical path, opening date and cost."""
    start = start or date.today()
    by_id = {s["id"]: s for s in steps}
    for s in steps:  # keep only dependencies that exist, and never on itself
        s["depends_on"] = [d for d in s.get("depends_on", []) if d in by_id and d != s["id"]]

    finish: dict[str, int] = {}
    visiting: set[str] = set()

    def end_of(sid: str) -> int:
        if sid in finish:
            return finish[sid]
        if sid in visiting:  # break dependency cycles from model output
            by_id[sid]["depends_on"] = []
        visiting.add(sid)
        s = by_id[sid]
        s["start_day"] = max([end_of(d) for d in s["depends_on"]] or [0])
        visiting.discard(sid)
        finish[sid] = s["start_day"] + int(s["duration_days"])
        s["end_day"] = finish[sid]
        return finish[sid]

    for s in steps:
        end_of(s["id"])

    gating = [s for s in steps if s.get("gates_opening", True)] or steps
    open_day = max((s["end_day"] for s in gating), default=0)

    # Critical path: walk back from the last gating step through the dependency that finished last.
    for s in steps:
        s["critical"] = False
    cur = max(gating, key=lambda s: s["end_day"], default=None)
    while cur:
        cur["critical"] = True
        prev = [by_id[d] for d in cur["depends_on"] if by_id[d]["end_day"] == cur["start_day"] and cur["start_day"] > 0]
        cur = max(prev, key=lambda s: s["duration_days"], default=None)

    ordered = sorted(steps, key=lambda s: (s["start_day"], s["end_day"], s["name"]))
    for i, s in enumerate(ordered, 1):
        s["order"] = i
        s["start_date"] = (start + timedelta(days=s["start_day"])).isoformat()
        s["end_date"] = (start + timedelta(days=s["end_day"])).isoformat()
    return {
        "steps": ordered,
        "open_day": open_day,
        "open_date": (start + timedelta(days=open_day)).isoformat(),
        "fees_usd": sum(int(s.get("fee_usd", 0)) for s in steps),
        "critical_path": [s["name"] for s in ordered if s["critical"]],
    }


def format_plan(profile: dict[str, Any], plan: dict[str, Any]) -> str:
    """Owner-facing plan text."""
    kind = {"cafe": "café", "restaurant": "restaurant", "retail_boutique": "boutique"}.get(profile.get("business_type", ""), "business")
    where = profile.get("city") or "your city"
    lines = [
        f"# Launch plan: {kind} in {where}",
        "",
        f"**Realistic opening:** {plan['open_date']}  ·  **Permit and license fees:** about ${plan['fees_usd']:,}",
        f"**Steps that set your opening date:** {' → '.join(plan['critical_path']) or 'none'}",
        "",
        "| # | Step | Who | Starts | Takes | Fee | Source |",
        "|---|------|-----|--------|-------|-----|--------|",
    ]
    for s in plan["steps"]:
        flag = "⏱ " if s["critical"] else ""
        src = f"[link]({s['source_url']})" if s.get("source_url") else ""
        status = "" if s["status"] == "Official source" else f" · {s['status']}"
        if s.get("reviewed_by_human") and "reviewer" not in status:
            status += " · ✎ corrected by reviewer"
        lines.append(
            f"| {s['order']} | {flag}{s['name']} | {s['agency'] or s['level'].title()} | {s['start_date']} | "
            f"{s['duration_days']} d | ${int(s['fee_usd']):,} | {src}{status} |"
        )
    unverified = [s["name"] for s in plan["steps"] if s["status"] == "Needs verification"]
    if unverified:
        lines += ["", f"**Needs verification** (no official .gov source found): {', '.join(unverified)}."]
    lines += ["", "_Guidance based on public sources, not legal advice. Confirm with each agency._"]
    return "\n".join(lines)
