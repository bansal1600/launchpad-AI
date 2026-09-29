# F16 — County-wide Expansion

**Phase:** Roadmap · **Depends on:** F02, F03, F06, F07

## Summary
A repeatable playbook and tooling to add each Santa Clara County city (Sunnyvale, Santa Clara, Mountain View, Palo Alto, Cupertino, Milpitas, Campbell, Los Gatos, Saratoga, Los Altos, Los Altos Hills, Morgan Hill, Gilroy, Monte Sereno) and unincorporated county areas, then other Bay Area counties. The architecture already keys rules by jurisdiction; this feature makes adding a city a research task measured in days, not a code change.

## User story
As the team, we want to add a new city by writing rule files and loading data, without changing engine code.

## Why it matters
Coverage is what makes the product sellable to county-wide partners (brokers, SBDC, lenders). Prioritize cities by commercial vacancy and business formation.

## Scope
- City onboarding checklist and template rule pack.
- Rule "inheritance": county/state rules shared (`'*'`), city rules override by `replaces?: string` (propose field).
- Data adapters per city for business registration datasets (many cities publish different formats or none — fall back to county/state data or commercial sources).
- Coverage dashboard: which cities have which features.

## City onboarding checklist
1. Business license/tax: name, agency, registration window, source.
2. Zoning clearance/planning process and zoning GIS layer.
3. Building/tenant improvement permit and fire prevention process.
4. Sign permit.
5. Local programs/grants and small business help desk.
6. Business registration open data (for competitors) — yes/no/format.
7. Cross-check with CalGOLD for the city + business types.
8. Validation call with the city's economic development office.
9. Mark `supported: true` in `cities.json` only after tests pass.

## Build roadmap
- [ ] 1. Add `replaces` support and tests to `selectPermits`.
- [ ] 2. Template rule pack generator (`scripts/new_city.ts sunnyvale`).
- [ ] 3. Competitor data adapter interface (`CompetitorSource`) + SJ implementation refactor.
- [ ] 4. Coverage dashboard page.
- [ ] 5. Onboard Sunnyvale as the second city end-to-end.

## Acceptance criteria
- Adding Sunnyvale requires only new JSON rules + a data adapter; engine code unchanged.
- F08 "move to Sunnyvale" produces a full plan.

## Prompt to give Claude
> Build F16 per this file: rule override support, a new-city scaffolding script, a pluggable competitor data adapter interface, and a coverage dashboard.
