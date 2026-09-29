# AI Small Business Ally — Project Overview

> **How to use this pack with Claude:** Give Claude this file and `00_shared_data_model.md` first, every time. Then give it ONE feature file at a time, in the build order below, and say: *"Build this feature following the overview and data model. Ask me before changing any shared types."*

## 1. The product in one paragraph

An AI co-pilot for people opening a physical business in Santa Clara County, California (starting with the City of San José). The owner enters a business type and an address. The product returns a personalized, sequenced launch plan: which government bodies regulate them, every permit they need in dependency order, a realistic timeline, a startup cost estimate, nearby competitors (including health inspection scores for food businesses), and grants they may qualify for. Every requirement links to its official source. The plan is **conversational**: the owner can say "add beer and wine" or "what about Sunnyvale instead?" and the plan, charts, and costs update instantly with a summary of what changed.

**Tagline:** Know before you sign the lease.

## 2. Problem

- Requirements are split across city, county, and state agencies. In San José, the Business Tax Certificate does not grant zoning, fire, occupancy, or health approval — owners often assume it does.
- Food health permits from the County Department of Environmental Health are not transferable to new owners.
- Every month of permitting delay means rent and payroll with no revenue.
- The state's CalGOLD tool gives a generic list, not an address-specific, sequenced plan.
- San José's Small Business Ally program provides this help in person, but with very few staff.

## 3. Target users

| User | Need | Hackathon priority |
|---|---|---|
| First-time owner (café, boutique, restaurant) | "What do I need, how long, how much?" | Primary demo persona |
| Commercial real estate broker | Help tenants sign with confidence; fill vacant storefronts | Primary paying customer (Sell It track) |
| Business associations / SBDCs | Serve more owners with the same staff | Secondary customer |
| City economic development office | Scale the Small Business Ally program | Stretch customer |

## 4. Scope for the hackathon

- **Geography:** City of San José only. Architecture must support adding other cities later (rules are keyed by jurisdiction).
- **Business types:** `cafe` (prepared food, county health permit path) and `retail_boutique` (no food). Optional third: `restaurant`.
- **Positioning:** Sourced guidance, not legal advice. Every rule shows source URL and "last verified" date.

## 5. Feature list and build order

| # | Feature | File | Phase |
|---|---|---|---|
| 01 | Business intake | `features/F01_business_intake.md` | 1 — Core |
| 02 | Jurisdiction detection | `features/F02_jurisdiction_detection.md` | 1 — Core |
| 03 | Permit roadmap | `features/F03_permit_roadmap.md` | 1 — Core |
| 04 | Timeline chart | `features/F04_timeline_chart.md` | 2 — Core |
| 05 | Startup cost estimate | `features/F05_startup_cost_estimate.md` | 2 — Core |
| 06 | Competitor snapshot | `features/F06_competitor_snapshot.md` | 3 — Core |
| 07 | Incentive finder | `features/F07_incentive_finder.md` | 3 — Core |
| 08 | Conversational plan editing | `features/F08_conversational_plan_editing.md` | 2 — Core (demo centerpiece) |
| 09 | Scenario comparison | `features/F09_scenario_comparison.md` | 4 — Stretch |
| 10 | Lease red-flag check | `features/F10_lease_red_flag_check.md` | 4 — Stretch |
| 11 | Pre-filled applications | `features/F11_prefilled_applications.md` | 4 — Stretch |
| 12 | Shareable plan link | `features/F12_shareable_plan_link.md` | 4 — Stretch |
| 13 | Progress tracker | `features/F13_progress_tracker.md` | Roadmap |
| 14 | Deadline & renewal reminders | `features/F14_deadline_renewal_reminders.md` | Roadmap |
| 15 | Rule change monitoring | `features/F15_rule_change_monitoring.md` | Roadmap |
| 16 | County-wide expansion | `features/F16_countywide_expansion.md` | Roadmap |
| 17 | Multilingual support | `features/F17_multilingual_support.md` | Roadmap (quick win possible) |
| 18 | Broker & partner dashboard | `features/F18_broker_partner_dashboard.md` | Roadmap (B2B) |
| 19 | Property-first mode | `features/F19_property_first_mode.md` | Stretch (great B2B demo) |
| 20 | Branded reports | `features/F20_branded_reports.md` | Roadmap (B2B) |

**Recommended sequence:** Phase 0 (setup) → F01 → F02 → F03 → F04 → F05 → F08 → F06 → F07 → F19 → F09 → F12 → others.
F08 comes before F06/F07 because the "add beer and wine" moment is the core demo; competitors and incentives plug into the same engine afterwards.

## 6. Architecture

```
            ┌──────────────┐
 Owner ───► │  Next.js UI  │ ◄── charts (Recharts), map (Leaflet)
            └──────┬───────┘
                   │ BusinessProfile (JSON)
            ┌──────▼───────┐        ┌──────────────────────┐
            │  Plan Engine │ ◄───── │ Rules (JSON files)   │
            │ (pure, deter-│        │ permits, costs,      │
            │  ministic TS)│        │ incentives + sources │
            └──────┬───────┘        └──────────────────────┘
                   │ Plan                ┌──────────────────────┐
                   ├───────────────────► │ Data services        │
                   │                     │ geocode, competitors,│
                   │                     │ demographics (cached)│
            ┌──────▼───────┐             └──────────────────────┘
            │ Chat agent   │  Claude API: turns free text into a
            │ (LLM + tools)│  validated ProfilePatch, never edits
            └──────────────┘  the Plan directly
```

### Non-negotiable design rules

1. **The LLM never writes plan facts.** Permits, fees, durations, and incentives come only from rule files. The LLM's job is to (a) understand the owner and produce a `ProfilePatch`, (b) explain the plan in plain language, (c) ask clarifying questions.
2. **Plan = f(profile, rules, data).** `buildPlan()` is a pure function. Same inputs → same plan. This makes diffs, scenarios, and testing trivial.
3. **Every fact carries a source.** Rules have `sourceUrl`, `lastVerified`, and `verified: boolean`. Unverified values display a "needs verification" badge.
4. **Full recompute + diff.** On any change, rebuild the whole plan and diff it against the previous version. Do not attempt partial updates (fast enough at this scale, far fewer bugs).

## 7. Tech stack

| Layer | Choice | Why |
|---|---|---|
| App | Next.js (App Router) + TypeScript | One repo for UI + API routes |
| Styling | Tailwind CSS | Fast |
| Validation | zod | Shared schemas for UI, API, LLM tool calls |
| Rule conditions | json-logic-js | Declarative, testable conditions in JSON |
| Charts | Recharts | Gantt-style bars and stacked costs |
| Map | Leaflet + react-leaflet + OpenStreetMap tiles | Free, no key |
| Geo math | @turf/turf | Distances, point-in-polygon |
| Storage | SQLite via Prisma (or JSON files for hackathon) | Zero setup |
| LLM | Anthropic API (model in `ANTHROPIC_MODEL` env var; check docs for current model) | Tool use for ProfilePatch |
| Tests | Vitest | Engine unit tests |

## 8. Repository structure

```
/app
  /page.tsx                  landing + intake
  /plan/[id]/page.tsx        plan view (roadmap, timeline, costs, competitors, incentives, chat)
  /api/plan/route.ts         POST profile -> plan
  /api/chat/route.ts         POST message -> patch -> new plan + diff
  /api/geocode/route.ts
/lib
  /schemas.ts                zod schemas from 00_shared_data_model.md
  /engine/buildPlan.ts
  /engine/permits.ts
  /engine/timeline.ts
  /engine/costs.ts
  /engine/incentives.ts
  /engine/diff.ts
  /data/geocode.ts
  /data/competitors.ts
  /data/demographics.ts
  /llm/chatAgent.ts
/rules
  /permits/*.json            one file per permit rule
  /costs/*.json
  /incentives/*.json
/data
  /raw/                      downloaded CSVs (gitignored)
  /processed/                cleaned JSON used at runtime
/scripts
  ingest_sj_business_tax.ts
  ingest_scc_food_inspections.ts
/tests
```

## 9. Key data sources (verify URLs and field names before building)

| Source | Used by | Notes |
|---|---|---|
| US Census Geocoder (geocoding.geo.census.gov) | F02 | Returns lat/lng + Census place + tract; free, no key |
| City of San José Open Data (data.sanjoseca.gov) — Business Tax Certificates, Active Building Permits | F06, F19 | Includes NAICS codes; may need geocoding |
| Santa Clara County Open Data (data.sccgov.org) — DEH food facility inspections | F06 | Placard color + compliance score |
| Census ACS API (api.census.gov) | F06, F19 | Tract-level population, income |
| CalGOLD (calgold.ca.gov) | F03 | Cross-check permit list per city + business type |
| San José Finance — Business Tax Certificate pages | F03, F11 | Registration requirements |
| County DEH — food facility permits, plan check, change of ownership | F03 | Food path |
| CDTFA (seller's permit), CA Secretary of State (entity), County Clerk-Recorder (fictitious business name), CA ABC (alcohol) | F03 | State/county items |
| San José OEDCA — Storefront Activation Grants, Small Business Ally | F07 | Check current program status |

## 10. Environment variables

```
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=            # set to the current Claude model string from docs.claude.com
DATABASE_URL=file:./dev.db
```

## 11. Definition of done (hackathon demo)

1. Enter "café" + a real downtown San José address → plan renders in < 5 s with roadmap, timeline, cost chart, competitor map, incentives.
2. Type "add beer and wine" → alcohol license appears, timeline extends, cost rises, a diff card summarizes the change.
3. Type "what if it's a boutique instead?" → county health permit path disappears, costs drop.
4. Every permit card shows a source link.
5. Property-first mode (F19) on the same address shows ranked business types.

## 12. Disclaimer text (show in footer and on every plan)

> This plan is guidance based on public government sources, each linked. Requirements change and depend on your specific situation. Confirm with the issuing agency before acting. This is not legal advice.

## 13. Phase 0 — project setup (do before any feature)

- [ ] Create Next.js + TypeScript + Tailwind app; add zod, zod-to-json-schema, json-logic-js, recharts, leaflet, react-leaflet, @turf/turf, prisma, vitest, @anthropic-ai/sdk.
- [ ] Implement `/lib/schemas.ts` exactly as in `00_shared_data_model.md`.
- [ ] Create `/rules` folders and a startup loader that zod-validates every rule file.
- [ ] Stub `buildPlan()` returning an empty plan so UI work can start in parallel.
- [ ] Add the disclaimer component.

## 14. Suggested team split (hackathon)

| Owner | Work |
|---|---|
| Human CEO / researcher | Permit + incentive rule research (F03, F07 JSON), broker outreach, pitch |
| Human CTO | Engine (F03–F05, F08 diff), data ingestion (F06) |
| AI co-founder (Claude) | Build features from these files, write tests, draft outreach |

## 15. Notes on "(propose)" items
Some later feature files suggest new fields or tables marked "(propose)". Add them to `00_shared_data_model.md` first, then build.
