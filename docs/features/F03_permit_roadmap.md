# F03 — Permit Roadmap

**Phase:** 1 (Core) · **Depends on:** F01, F02 · **Used by:** F04, F05, F08, F11, F13

## Summary
The heart of the product: a personalized, **dependency-ordered** list of every permit, license, and registration the business needs across city, county, and state — each with what it is, who issues it, how long it takes, what it costs, what must happen first, and a link to the official source. Rules are stored as JSON files and selected with deterministic conditions, so the list is explainable and never hallucinated.

## User story
As an owner, I want to know every approval I need and in what order, so I don't waste weeks or sign a lease for a space I can't use.

## Why it matters
Static lists (like CalGOLD) exist; **sequencing and personalization** don't. Owners get stuck because they don't know that one approval unlocks another, or that their business license is not a zoning approval.

## Scope
**MVP — San José, café + boutique paths.** Seed rule set (names to be verified against official sources; fill durations/fees from sources and mark `verified`):

| Rule id | Level | Applies when |
|---|---|---|
| `ca_sos_entity_registration` | state | entityType in llc/corporation/partnership |
| `irs_ein` | federal | employeesPlanned > 0 or entity is not sole_prop |
| `scc_fictitious_business_name` | county | business name differs from legal owner name |
| `cdtfa_sellers_permit` | state | sells tangible goods (all cafés, boutiques) |
| `sj_zoning_clearance` | city | always for storefront (use permitted by zoning) |
| `sj_building_permit_ti` | city | acquisition = new_buildout, or prepared_food with kitchen changes |
| `sj_fire_inspection` | city | storefront with occupancy/buildout changes |
| `sj_sign_permit` | city | exteriorSign = true |
| `scc_deh_plan_check` | county | prepared_food and acquisition = new_buildout |
| `scc_deh_health_permit` | county | foodService != none |
| `scc_deh_change_of_ownership_eval` | county | foodService != none and acquisition = change_of_ownership |
| `ca_abc_license` | state | alcohol != none (beer_wine vs full_bar variants) |
| `sj_business_tax_certificate` | city | always in San José; warning: "Does not grant zoning, fire, occupancy, or health approval" |
| `certificate_of_occupancy` | city | new_buildout / change of use |
| `edd_employer_registration` | state | employeesPlanned > 0 |

**Later:** outdoor seating/sidewalk café permit, music/entertainment, home occupation, specialized salons (state Board of Barbering & Cosmetology).

## Rule authoring process (do this first — it's research, not code)
1. For each rule: open the official page, fill `name`, `agency`, `howToApply`, `requiredDocs`, `sourceUrl`.
2. Fees and durations: use the official fee schedule if published; otherwise put a range and `verified: false`.
3. Cross-check the full list against CalGOLD results for "San Jose" + business type.
4. Record `lastVerified` date. Never invent a number without marking it unverified.
5. Optionally: call San José's Small Business Ally office to sanity-check the dependency order (also a great Sell It conversation).

## Logic
```ts
selectPermits(profile, rules):
  candidates = rules.filter(r =>
      (r.jurisdictions.includes('*') || r.jurisdictions.includes(profile.jurisdiction.cityId))
   && jsonLogic.apply(r.appliesWhen, profile))
  // drop dependsOn entries that point to rules not selected
  return topoSort(candidates)   // throw on cycles
```
- Topological sort by `dependsOn`; ties broken by level (state → county → city) then name.
- Each item gets an "Why you need this" line generated from the matching condition (template, not LLM): e.g. "Because you serve prepared food."

## UI
- Grouped list by phase: **Set up the business** → **Secure the space** → **Build & inspect** → **Before opening**.
- Each card: name, agency, level badge, typical time, typical fee, "why you need this", dependency chips ("After: Zoning clearance"), source link, verified/unverified badge, warnings in amber.
- Expandable "How to apply" + required documents.
- "Ask about this permit" button → opens chat (F08) with context.

## API
- Part of `POST /api/plan` response (`plan.permits`).
- `GET /api/rules/permits/:id` for detail view.

## Build roadmap
- [ ] 1. Research and write the 15 rule JSON files (half a day; split across team).
- [ ] 2. zod-validate all rule files at startup; fail loudly on bad data.
- [ ] 3. Implement `selectPermits` with json-logic-js and `topoSort` with cycle detection.
- [ ] 4. "Why you need this" template generator.
- [ ] 5. Phase grouping + permit cards UI.
- [ ] 6. Detail drawer with how-to-apply and docs.
- [ ] 7. Unit tests for each business-type path.

## Acceptance criteria
- Café, prepared food, no alcohol, second-generation → includes seller's permit, health permit, business tax certificate, zoning clearance; excludes ABC license.
- Same café with `alcohol: beer_wine` → ABC license added, placed after entity/zoning dependencies.
- Boutique → no county health items.
- Change of ownership café → change-of-ownership evaluation present, with warning that health permits don't transfer.
- Every card has a working source URL.

## Edge cases
- Unsupported city → return only state/federal/county rules + banner "City-specific steps not yet available for {city}. Check CalGOLD and your city's business office."
- Dependency on an unselected rule → ignore silently.
- Cycle in rules → build-time error with rule ids.

## Tests
- Snapshot tests for 6 profiles (café variants, boutique, restaurant change of ownership).
- Validate that all `dependsOn` ids exist.

## Prompt to give Claude
> Build F03 per this file. First scaffold the 15 rule JSON files with all known fields and `verified: false` placeholders for fees and durations, clearly marked TODO. Then implement `selectPermits`, `topoSort`, and the grouped permit UI with tests.
