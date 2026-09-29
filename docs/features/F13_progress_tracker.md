# F13 — Progress Tracker

**Phase:** Roadmap · **Depends on:** F03, F04, F08

## Summary
Once the owner starts executing, they mark each permit as not started / submitted / approved (with actual dates). The timeline switches from estimates to reality: completed steps lock in real dates, and the projected opening date updates. Delays on critical-path items trigger a warning and suggested next actions.

## User story
As an owner in the middle of permitting, I want to track where each application stands and see how delays affect my opening date.

## Why it matters
Turns a one-time planning tool into a months-long workspace (retention), and generates valuable real-world duration data to improve estimates over time.

## Scope
**MVP (post-hackathon):** status + dates per permit, recompute timeline with actuals, overdue warnings.
**Later:** document upload per step, agency status lookups where APIs exist, anonymized duration analytics to improve `durationDays`.

## Data model changes (propose)
- `PlanPermitItem.status` extended: `not_started | submitted | approved | rejected`.
- Add `submittedDate?`, `approvedDate?`, `notes?`.
- Scheduling: completed items use actual dates; in-progress items use `submittedDate + remaining typical`.

## Logic
- `scheduleTimeline` accepts actuals; items with `approvedDate` are fixed.
- Overdue: in-progress item past `submittedDate + durationDays.max` → alert.
- Critical delay: overdue item on critical path → "Opening now projected {new date}; consider contacting {agency} / Small Business Ally."

## UI
- Checklist mode of the roadmap with status dropdowns and date pickers.
- Timeline shows solid bars for actual, hatched for projected.
- Progress bar: "6 of 11 approvals complete".

## Build roadmap
- [ ] 1. Extend schema + migrations.
- [ ] 2. Update `scheduleTimeline` for actuals + tests.
- [ ] 3. Checklist UI.
- [ ] 4. Overdue/critical alerts.
- [ ] 5. Chat support: "My health permit was approved today" → status patch via F08.

## Acceptance criteria
- Marking a critical item approved early pulls the opening date earlier.
- Overdue critical item shows alert with new date.

## Prompt to give Claude
> Build F13 per this file, extending the timeline engine to handle actual dates and adding a checklist mode and chat-driven status updates.
