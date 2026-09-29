# F05 — Startup Cost Estimate

**Phase:** 2 (Core) · **Depends on:** F03, F04 · **Used by:** F08, F09

## Summary
A transparent estimate of what it will cost to get to opening day, broken into categories (permits & fees, deposits, build-out, equipment, inventory, professional services, carrying costs during permitting, contingency) with low / typical / high ranges. Crucially it includes **carrying costs** — rent paid while waiting on permits — which links cost directly to the timeline and makes delays visible in dollars.

## User story
As an owner, I want a realistic budget including the cost of waiting, so I raise enough money and don't run out before opening.

## Why it matters
Owners underestimate costs most in hidden categories: permit delays, deposits, professional fees. Tying cost to the timeline makes "add beer and wine" show both the extra weeks *and* the extra dollars.

## Scope
**MVP**
- Permit fees: sum of selected `PlanPermitItem.feeTypical` (and ranges).
- Cost rules by business type (sq-ft, seat, and fixed formulas).
- Carrying costs = monthly rent estimate × (timeline months before opening). Ask for rent or use an assumption per sq ft (clearly marked as an assumption and editable).
- Contingency as % of subtotal.
- Budget comparison: "Estimated $182K typical vs your $150K budget."

**Later:** financing options, cash-flow projection after opening.

## Data sources
- Permit fees from F03 rules.
- Other cost ranges: industry guides and local broker input; store in `/rules/costs/*.json` with `verified: false` unless from an official or cited source. Show "estimate" badges.
- **Best source for the demo:** ask a local broker or SBDC advisor for San José ranges (doubles as customer discovery).

## Logic
```
for rule in costRules where applies:
  switch formula:
    fixed          -> amount
    per_sqft       -> amount * squareFeet (default sqft by type if missing)
    per_seat       -> amount * seats
    months_of_rent -> monthlyRent * months (months from timeline for carrying cost)
    percent_of_subtotal -> applied last
total = sum(lines)  // separately for low/typical/high
overBudget = budgetUsd && total.typical > budgetUsd
```
- Carrying cost uses timeline months: `ceil(totalDays.typical / 30)` (low uses min, high uses max).

## UI
- Stacked horizontal bar (or donut) of categories, typical values.
- Total with range: "$182K (range $140K – $240K)".
- Table below with each line, range, and source/assumption label.
- Editable assumptions panel: monthly rent, sq ft, seats → recalculates live.
- Budget gauge if budget provided.
- Callout: "Each month of permit delay costs about **$X** in rent."

## API
- `plan.costs` from engine. `POST /api/plan/:id/assumptions` → patch profile/assumptions → rebuild.

## Build roadmap
- [ ] 1. Write cost rule JSON files for café and boutique (8–12 lines each).
- [ ] 2. Implement `estimateCosts()` including carrying-cost link to timeline.
- [ ] 3. Assumptions model: use `monthlyRentUsd` from BusinessProfile; if missing, default from sq ft × assumed rent per sq ft (editable).
- [ ] 4. Chart + table UI with "estimate/verified" badges.
- [ ] 5. "Cost of one month delay" callout.
- [ ] 6. Tests.

## Acceptance criteria
- Changing monthly rent updates carrying costs and total instantly.
- Adding ABC license increases permit fees and (if timeline grows) carrying costs; both reflected in diff.
- Every line shows whether it's sourced or an assumption.

## Edge cases
- Missing sq ft → use type default and label "assumed 1,200 sq ft".
- Budget absent → hide gauge.

## Tests
- Formula unit tests; contingency applied after subtotal; carrying cost uses correct timeline pass for low/typical/high.

## Prompt to give Claude
> Build F05 per this file. Implement `estimateCosts` with formula types and a carrying-cost line linked to the timeline, seed placeholder cost rules marked unverified, and build the stacked chart, table, and editable assumptions panel.
