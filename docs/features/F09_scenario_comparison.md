# F09 — Scenario Comparison

**Phase:** 4 (Stretch) · **Depends on:** F04, F05, F08 · **Used by:** F12, F18

## Summary
Owners save versions of their plan as named scenarios ("Downtown with beer", "Sunnyvale, no alcohol", "Buy existing restaurant") and compare two or three side by side: opening date, total cost, number of permits, grants, competitor saturation, and a per-metric winner. Turns the conversational edits from F08 into real decisions.

## User story
As an owner deciding between two spaces or concepts, I want to see them side by side so I can choose with numbers instead of gut feel.

## Why it matters
Real decisions are comparisons. It's also a strong broker feature: "here's Space A vs Space B for your concept."

## Scope
**MVP:** save current plan as scenario (name it), compare up to 3, side-by-side metrics + dual timeline + dual cost bars, "Make this my main plan."
**Later:** AI-written recommendation paragraph (grounded in numbers), shareable comparison (F12).

## Logic
- A `Scenario` stores a profile snapshot and its plan id (see data model).
- Comparison computed from existing Plan objects; no new engine logic.
- Winner per metric: earliest open date, lowest typical cost, most incentive value, lowest saturation. Ties → "Even".
- From chat: "Compare this with Sunnyvale" → F08 creates a scenario from a patched copy without changing the main plan (`compare_scenarios` tool).

## UI
- "Save as scenario" button in plan header; scenario tabs.
- Comparison page: columns per scenario, rows per metric, winner highlighted.
- Overlaid timeline bars (one row per scenario total duration) and grouped cost bars.
- Permit differences: "Only in B: Alcohol license".

## API
- `POST /api/scenarios` `{ planId, label }`
- `GET /api/scenarios/compare?ids=a,b,c`

## Build roadmap
- [ ] 1. Scenario storage + save/rename/delete.
- [ ] 2. Comparison computation (pure function) + tests.
- [ ] 3. Comparison UI with charts.
- [ ] 4. Chat tool `compare_scenarios` (creates scenario from patch without touching main plan).
- [ ] 5. "Make main plan" action.

## Acceptance criteria
- Two scenarios differing only in alcohol show correct deltas matching F08 diff.
- Comparison loads in < 1 s (no recompute).

## Edge cases
- Scenario in an unsupported city → show available metrics, mark others "not available".

## Prompt to give Claude
> Build F09 per this file using existing Plan objects; add a `compare_scenarios` tool to the F08 agent that forks the profile without changing the main plan.
