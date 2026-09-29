# F06 — Competitor Snapshot

**Phase:** 3 (Core) · **Depends on:** F02 · **Used by:** F08, F09, F19

## Summary
A map and short summary of similar businesses near the chosen address: how many exist within a walkable radius, how many opened recently, and — for food businesses — how well they perform on county health inspections. Ends with a simple saturation signal (low / medium / high) and a one-paragraph plain-language takeaway. Built from public government data, not scraped reviews.

## User story
As an owner, I want to see who I'd be competing with before signing a lease, so I can judge whether this location can support my business.

## Why it matters
Saturation is one of the costliest location mistakes and one owners rarely quantify. Using city business registrations and county inspection data is unique and credible ("government data, not guesses").

## Scope
**MVP**
- Data: San José Business Tax Certificate dataset (NAICS code, business name, address, start date) + Santa Clara County DEH food inspection data (placard color, compliance score).
- Radius: 800 m default (≈ 10-minute walk), adjustable 400 m / 800 m / 1.6 km.
- Metrics: count, opened in last 24 months, average inspection score (food only), saturation level.
- Map with pins; list sorted by distance.

**Later:** foot-traffic proxies, Google Places ratings (licensing permitting), demographics panel (Census ACS: population, median income for tract).

## Data sources & ingestion
1. **San José Business Tax Certificates** — City of San José open data portal (data.sanjoseca.gov). Download CSV. Check field names (business name, NAICS, address, start date, home-business flag).
2. **SCC DEH food facility inspections** — Santa Clara County open data (data.sccgov.org). Typically separate tables for businesses, inspections, violations; join on business id. Take latest inspection per facility.
3. **Geocoding:** if business records lack lat/lng, batch-geocode with the Census batch geocoder (CSV upload, up to 10,000 rows per batch — verify limit) and cache.

**NAICS mapping (store in `data/processed/naics_map.json`):**
| businessType | NAICS prefixes (verify) |
|---|---|
| cafe | 722515 (snack & nonalcoholic beverage bars), 722513 |
| restaurant | 722511, 722513 |
| retail_boutique | 4481xx / 458110 (clothing stores — NAICS 2022 codes changed; include both) |
| salon | 812112, 812113 |

## Logic
```
competitors = businesses where naics matches type
              and not homeBusiness
              and distance(address, business) <= radius
openedLast24Months = count(startDate >= today - 24mo)
if food type: join latest inspection by fuzzy name + address match
saturation:
  density = count per km² ; compare with citywide percentile for that type
  <40th pct -> low, 40–80 -> medium, >80 -> high
takeaway = template sentence (LLM optional for polish, numbers from engine only)
```
- Precompute citywide density percentiles per type at ingestion time.
- Fuzzy match business ↔ inspection facility using normalized address + name similarity (e.g., Jaro-Winkler > 0.85).

## UI
- Leaflet map: owner's location star, competitor pins colored by inspection placard (green/yellow/red) or neutral for non-food.
- Radius circle and radius toggle.
- Summary card: "14 cafés within a 10-minute walk · 4 opened in the last 2 years · average inspection score 91 · Saturation: **High**".
- List: name, distance, open since, inspection badge.
- Honest caveat: "Registered businesses may include closed ones; data from City of San José and Santa Clara County."

## API
- `GET /api/competitors?lat&lng&type&radius` → `CompetitorSummary`
- Included in `plan.competitors`.

## Build roadmap
- [ ] 1. Download datasets; write `scripts/ingest_sj_business_tax.ts` and `scripts/ingest_scc_food_inspections.ts` → cleaned JSON in `/data/processed`.
- [ ] 2. Batch geocode missing coordinates; cache results.
- [ ] 3. NAICS mapping + filter.
- [ ] 4. Inspection join with fuzzy matching; report match rate in console.
- [ ] 5. Precompute density percentiles.
- [ ] 6. `getCompetitors()` using turf distance (or a simple grid index for speed).
- [ ] 7. Map + summary + list UI.
- [ ] 8. Tests with a small fixture dataset.

## Acceptance criteria
- Downtown San José café query returns results in < 1 s from processed data.
- Food competitors show inspection badges for ≥ 70% of matches (report actual match rate).
- Changing radius updates count and saturation.
- Switching business type in chat (F08) swaps the competitor set.

## Edge cases
- Records with no start date → exclude from "opened recently", keep in count.
- Chains with many registrations at one address → dedupe by address + name.
- Unsupported city → "Competitor data available for San José only."

## Tests
- Distance filter, NAICS filter, dedupe, saturation thresholds using fixtures.

## Prompt to give Claude
> Build F06 per this file. Start with ingestion scripts that output cleaned JSON (I'll provide the downloaded CSVs in `/data/raw`), then `getCompetitors`, then the Leaflet map and summary UI. Print the inspection match rate after ingestion.
