---
tags: [agentapp]
dataset: []
framework: []
---

# Comply Cofounder AgentApp (Flower)

A human-supervised team of agents that plans every permit a café, restaurant or boutique needs to open in San José / Santa Clara County. Every step carries a source, the Checker flags anything without an official `.gov` source, and nothing moves forward until the owner types **APPROVE**.

## How it works

```
Owner message
  → Intake agent        profile JSON (asks one question if needed)
  → Jurisdiction agent  web_fetch → US Census geocoder: city, unincorporated county, or out of area
  → City agent          web_search + web_fetch → official city requirements
  → County Health agent web_search + web_fetch → County Environmental Health + Clerk-Recorder
  → State agent         web_search + web_fetch → SOS, CDTFA, EDD, ABC, IRS
  → Planner agent       fixes dependencies; planning.py computes order, critical path, opening date, fees
  → Checker             no official .gov source → "Needs verification"
  → Plan shown, run stops: "Reply APPROVE to confirm, or tell me what to change."
Owner: "Step 4: fee is $5,500, source https://…"  → Reviewer agent applies the fix, re-plans
Owner: "APPROVE"                                  → plan confirmed (read from conversation history)
Owner: "remind me"                                → start_automation schedules up to 3 deadline reminders
```

Safety:
- Each agent gets only the connectors it needs, and every tool call is checked against that list.
- Tool loops are capped at 5 iterations.
- Street addresses never go to web search (only city and county do).
- Logs and status events carry no personal data.
- Reminders are only possible after approval, and nothing is ever filed automatically.

`agent/rules.py` holds fallback permit rules (ported from the Launchpad AI web app) that are used when an agency search comes back empty.

## Files

- `agent/agent_app.py`: the roles, tool loop, approval and reminder flow
- `agent/planning.py`: deterministic merge, schedule, critical path, source check, plan formatting
- `agent/rules.py`: fallback permit rules with official source links
- `tests/test_agent.py`: offline tests with a fake model and session (full flow, human fix, tool allow-list, loop cap, no personal data in logs)

## Build and test

```bash
uv sync
uv run pytest -q
uv run flwr build
```

## Run locally

Terminal 1:
```bash
export FLWR_MODEL_API_KEY="<Flower or Nebius key>"
# Optional, for another OpenAI-style /v1/responses provider:
# export FLWR_MODEL_API_ENDPOINT="https://…/v1"
uv run flower-superlink --insecure
```

Add to `~/.flwr/config.toml`:
```toml
[superlink.local-agent]
address = "127.0.0.1:8000"
insecure = true
```

Terminal 2:
```bash
export FLWR_CHAT_SUPERLINK=local-agent
uv run flwr chat        # then /load to run this app
```

The model is set in `pyproject.toml` under `[tool.flwr.app.config]` (`model = "openai/gpt-5.6-sol"`). Change it to whatever model name your key's provider uses.

## Publish and run on SuperGrid

Set `publisher` in `pyproject.toml` to your Flower username, then:
```bash
uv run flwr login supergrid
uv run flwr app publish .
uv run flwr run . supergrid --stream
```

## Demo script (60 seconds)

1. `Café at 87 N San Pedro St, San Jose`: watch Intake, Jurisdiction, City, County, State, Planner and Checker run.
2. The Checker flags a step without a .gov source.
3. `Step N: fee is $5,500, source https://www.sanjoseca.gov/...`: the Reviewer fixes it and the plan is re-checked.
4. `APPROVE`
5. `remind me`: a reminder is scheduled.
6. Close: "Every claim has a source, and nothing happens without a human saying yes."
