# F19 — Property-First Mode

**Phase:** Stretch (strong B2B demo) · **Depends on:** F02, F03, F04, F05, F06, F07

## Summary
Flips the question from "where should my café go?" to "what business fits this space?" Enter a storefront address (plus optional size, ground floor, vacancy, prior use) and get a ranked list of business types by fit: permit complexity and time to open, estimated startup cost, competitor saturation nearby, local demand signals, zoning compatibility, and incentives. Built for landlords and brokers trying to fill vacant storefronts — and for cities trying to activate them.

## User story
As a broker with a vacant storefront, I want to know which business types can open here fastest and face the least competition, so I can target the right tenants.

## Why it matters
Directly addresses vacant ground-floor storefronts (a known downtown San José challenge) and gives the Sell It track a customer with urgent, recurring pain and budget.

## Scope
**MVP:** address + property facts → run the engine for each supported business type (café, restaurant, boutique, salon) → score and rank → explanation per type.
**Later:** demand model using Census ACS (population, income, daytime workers), gap analysis ("no bakery within 1 km"), zoning-based filtering of disallowed uses.

## Logic
```
for type in SUPPORTED_TYPES:
   profile = defaultsFor(type) + property facts (address, sqft, groundFloor, vacancy, acquisition inferred from prior use)
   plan = buildPlan(profile)
   score = weighted(
      timeToOpen (lower better)       0.30,
      startupCost (lower better)      0.20,
      saturation (lower better)       0.25,
      incentives value (higher)       0.10,
      demand signal (higher, later)   0.15)
normalize each metric across types (min-max), weights configurable in UI
explanation = template: "Opens ~9 weeks faster than a restaurant (existing kitchen), only 2 bakeries within 800 m, qualifies for vacant storefront grant"
```
- Prior use matters: former restaurant → `acquisition: 'second_generation'` for food types (faster, cheaper).

## UI
- Property input card (address, sq ft, ground floor, months vacant, previous use).
- Ranked list: type, fit score bar, open time, cost, saturation, incentive badges, one-line reason.
- Weight sliders ("I care most about speed").
- "Open full plan" for any type → normal plan view (and chat).

## API
- `POST /api/property-fit` `{ property }` → `{ rankings: [...] }` (runs plans in parallel; cache by address).

## Build roadmap
- [ ] 1. `PropertyInput` schema (propose in data model) and mapping to profiles per type.
- [ ] 2. Parallel plan generation + scoring function with tests.
- [ ] 3. Ranking UI with weight sliders.
- [ ] 4. Link into full plan.
- [ ] 5. (Later) ACS demand signal.

## Acceptance criteria
- Former-restaurant storefront ranks food types higher on time-to-open than a raw shell.
- Changing weights re-ranks instantly client-side.

## Demo tip
Use the same downtown address as the café demo, so the audience sees the product from both sides: owner and landlord/broker.

## Prompt to give Claude
> Build F19 per this file: generate plans for each supported type from property facts, score with configurable weights, and render a ranked list that links into the full plan.
