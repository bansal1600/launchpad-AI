# F04 — Timeline Chart

**Phase:** 2 (Core) · **Depends on:** F03 · **Used by:** F08 (visible diff), F09, F13

## Summary
Turns the permit roadmap into a Gantt-style chart with a realistic projected opening date, a highlighted critical path, and a best/typical/worst range. This is the chart judges will watch move when the owner types "add beer and wine," so it must animate clearly and read instantly.

## User story
As an owner, I want to see when I can realistically open and which steps control that date, so I can negotiate rent-free months and plan hiring.

## Why it matters
Time is where money is lost. Showing the critical path tells owners which step to start today and which delays actually matter.

## Scope
**MVP**
- Schedule permits using dependencies and typical durations.
- Compute min / typical / max total duration.
- Highlight critical path.
- Compare with `targetOpenDate` if provided ("You'll likely miss your March target by 5 weeks").

**Later:** real dates from progress tracking (F13), agency backlog adjustments.

## Logic (critical path method)
```
for each permit in topo order:
  start = max(end of all dependencies) or 0
  end   = start + durationDays.typical
totalTypical = max(end)
critical path = walk back from the latest-ending item through the dependency that determined its start
repeat with min and max durations for the range
projectedOpenDate = planStartDate + totalTypical
meetsTargetDate = projectedOpenDate <= targetOpenDate
```
- Items with no dependencies start at day 0 in parallel.
- Add a fixed "Pre-opening (hiring, training, soft open)" block of ~14 days after the last permit (make it a CostRule-like config, not hard-coded).

## UI
- Horizontal bars (Recharts `BarChart` with stacked invisible offset bar + visible duration bar, layout="vertical").
- Critical-path bars in a strong color; others muted.
- Vertical line for today and for the target date.
- Header: "Likely opening: **May 12** (range Apr 20 – Jul 3)".
- On plan change: animate bar width/position; newly added bars flash briefly (ties into F08 diff).
- Hover tooltip: duration range, dependencies, "starting this late delays opening by X days" for critical items.

## API
- `plan.timeline` + `plan.permits[].startDay/endDay/isCriticalPath` from engine.

## Build roadmap
- [ ] 1. Implement `scheduleTimeline()` (pure function) with min/typical/max passes.
- [ ] 2. Critical path backtrack.
- [ ] 3. Target date comparison and message.
- [ ] 4. Recharts Gantt component with critical-path styling.
- [ ] 5. Animations + "new" highlight state driven by `PlanDiff.permitsAdded`.
- [ ] 6. Tests.

## Acceptance criteria
- Two independent permits of 10 and 20 days → total 20, critical = the 20-day one.
- Chain A(10) → B(5) → total 15, both critical.
- Adding ABC license to a café extends typical total when its duration exceeds the current critical path.
- Chart remains readable with 15 bars on a laptop screen and scrolls on mobile.

## Edge cases
- No permits (unsupported) → show message, no chart.
- Target date in the past → warn.

## Tests
- Unit tests for scheduling fixtures above, plus a diamond dependency graph.

## Prompt to give Claude
> Build F04 per this file: a pure `scheduleTimeline` with critical path and min/typical/max, plus a Recharts Gantt component that animates changes and highlights new bars based on a `PlanDiff`.
