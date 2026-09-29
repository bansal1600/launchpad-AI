# Shared Data Model (the contract every feature uses)

> Implement these as zod schemas in `/lib/schemas.ts` and export inferred TypeScript types. **Do not change these shapes inside a single feature** — propose changes here first.

## 1. BusinessProfile — the owner's inputs (the only thing chat edits)

```ts
BusinessType = 'cafe' | 'restaurant' | 'retail_boutique' | 'salon' | 'other'

FoodService   = 'none' | 'prepackaged_only' | 'prepared_food'
Alcohol       = 'none' | 'beer_wine' | 'full_bar'
Acquisition   = 'new_buildout' | 'second_generation' | 'change_of_ownership'
EntityType    = 'sole_prop' | 'llc' | 'corporation' | 'partnership' | 'undecided'

BusinessProfile {
  id: string
  businessName?: string
  businessType: BusinessType
  address: {
    raw: string
    normalized?: string
    lat?: number
    lng?: number
  }
  jurisdiction?: Jurisdiction          // filled by F02, never by the user
  squareFeet?: number
  groundFloor?: boolean
  storefrontVacantMonths?: number      // used by incentive rules
  foodService: FoodService
  alcohol: Alcohol
  seats?: number
  outdoorSeating?: boolean
  exteriorSign?: boolean
  acquisition: Acquisition
  entityType: EntityType
  employeesPlanned?: number
  budgetUsd?: number
  monthlyRentUsd?: number             // F05 assumption; default from sq ft if missing
  targetOpenDate?: string              // ISO date
  planStartDate: string                // ISO date, default = today
  language: 'en' | 'es' | 'vi' | 'zh'  // F17
}
```

**Defaults by business type** (apply in F01 when the user does not specify):
| type | foodService | alcohol | acquisition |
|---|---|---|---|
| cafe | prepared_food | none | second_generation |
| restaurant | prepared_food | none | second_generation |
| retail_boutique | none | none | new_buildout |

## 2. Jurisdiction

```ts
Jurisdiction {
  kind: 'city' | 'unincorporated'
  cityId?: string        // slug, e.g. 'san_jose', 'sunnyvale'
  cityName?: string
  county: 'santa_clara'
  censusTract?: string   // GEOID
  zoningCode?: string    // F02 stretch / F19
  supported: boolean     // false if we have no rules for this city yet
}
```

## 3. Rules (stored as JSON files in `/rules`)

### PermitRule

```ts
PermitRule {
  id: string                          // 'sj_business_tax_certificate'
  name: string
  shortDescription: string
  agency: string                      // 'City of San José Finance Department'
  level: 'federal' | 'state' | 'county' | 'city'
  jurisdictions: string[]             // ['san_jose'] or ['*'] for statewide/countywide
  appliesWhen: JsonLogic              // evaluated against BusinessProfile
  dependsOn: string[]                 // rule ids that must complete first
  canRunInParallelWith?: string[]
  durationDays: { min: number, typical: number, max: number }
  feeUsd: { min: number, typical: number, max: number }
  howToApply: string                  // plain-language steps
  requiredDocs: string[]
  sourceUrl: string
  lastVerified: string                // ISO date
  verified: boolean                   // false = show "needs verification" badge
  warnings?: string[]                 // e.g. 'Does not grant zoning approval'
}
```

Example `appliesWhen` (json-logic):
```json
{ "==": [ { "var": "foodService" }, "prepared_food" ] }
```
```json
{ "in": [ { "var": "alcohol" }, ["beer_wine", "full_bar"] ] }
```

### CostRule

```ts
CostRule {
  id: string
  category: 'permits_fees' | 'deposits' | 'buildout' | 'equipment' | 'inventory' | 'professional_services' | 'carrying_costs' | 'contingency'
  label: string
  appliesWhen: JsonLogic
  jurisdictions: string[]
  formula: 'fixed' | 'per_sqft' | 'per_seat' | 'months_of_rent' | 'percent_of_subtotal'
  amount: { low: number, typical: number, high: number }  // meaning depends on formula
  sourceUrl?: string
  verified: boolean
  note?: string
}
```

### IncentiveRule

```ts
IncentiveRule {
  id: string
  name: string
  provider: string
  jurisdictions: string[]
  eligibleWhen: JsonLogic
  likelyEligibleWhen?: JsonLogic       // partial match -> "may qualify"
  valueUsd?: { min: number, max: number }
  valueDescription: string
  requirements: string[]
  howToApply: string
  contact?: string
  sourceUrl: string
  lastVerified: string
  verified: boolean
  status: 'active' | 'paused' | 'unknown'
}
```

## 4. Plan — output of the engine (never edited directly)

```ts
PlanPermitItem {
  ruleId: string
  name: string
  agency: string
  level: string
  startDay: number          // offset from planStartDate
  endDay: number
  feeTypical: number
  isCriticalPath: boolean
  status: 'not_started' | 'in_progress' | 'approved'   // F13
  sourceUrl: string
  verified: boolean
  warnings: string[]
}

CostLine {
  ruleId: string
  category: string
  label: string
  low: number
  typical: number
  high: number
}

Competitor {
  id: string
  name: string
  lat: number
  lng: number
  distanceMeters: number
  naicsCode?: string
  startDate?: string
  inspection?: { placard: 'green' | 'yellow' | 'red', score: number, date: string }
}

CompetitorSummary {
  radiusMeters: number
  count: number
  openedLast24Months: number
  avgInspectionScore?: number
  saturation: 'low' | 'medium' | 'high'
  items: Competitor[]
}

IncentiveMatch {
  ruleId: string
  name: string
  match: 'eligible' | 'may_qualify'
  reasons: string[]          // why it matched / what's missing
  valueDescription: string
  sourceUrl: string
}

Plan {
  id: string
  profileId: string
  version: number
  createdAt: string
  profileSnapshot: BusinessProfile
  jurisdiction: Jurisdiction
  permits: PlanPermitItem[]
  timeline: {
    totalDays: { min: number, typical: number, max: number }
    projectedOpenDate: string
    criticalPath: string[]    // rule ids
    meetsTargetDate?: boolean
  }
  costs: {
    lines: CostLine[]
    total: { low: number, typical: number, high: number }
    overBudget?: boolean
  }
  competitors?: CompetitorSummary
  incentives: IncentiveMatch[]
  unsupportedReason?: string
}
```

## 5. Change tracking (F08, F09, F13)

```ts
ProfilePatch = Partial<BusinessProfile>   // validated with zod, only known fields

PlanDiff {
  permitsAdded: { ruleId: string, name: string }[]
  permitsRemoved: { ruleId: string, name: string }[]
  openDateDeltaDays: number
  costDeltaTypical: number
  incentivesGained: string[]
  incentivesLost: string[]
  jurisdictionChanged: boolean
  competitorCountDelta?: number
  humanSummary: string      // generated deterministically from the numbers above
}

ChangeEvent {
  id: string
  planId: string
  fromVersion: number
  toVersion: number
  userMessage: string
  patch: ProfilePatch
  diff: PlanDiff
  createdAt: string
}

Scenario {
  id: string
  label: string             // 'Downtown with beer'
  profile: BusinessProfile
  planId: string
}
```

## 6. Engine function signatures

```ts
buildPlan(profile: BusinessProfile, ctx: EngineContext): Promise<Plan>
selectPermits(profile, rules): PermitRule[]
scheduleTimeline(permits: PermitRule[], startDate): { items, totalDays, criticalPath }
estimateCosts(profile, costRules, permits): Plan['costs']
matchIncentives(profile, incentiveRules): IncentiveMatch[]
getCompetitors(profile): Promise<CompetitorSummary>
diffPlans(before: Plan, after: Plan): PlanDiff
```

`EngineContext` holds loaded rules and data-service clients so the engine stays testable (inject fakes in tests).

## 7. Database tables (Prisma, or JSON files for the hackathon)

- `Profile(id, json, createdAt, updatedAt)`
- `Plan(id, profileId, version, json, createdAt)`
- `ChangeEvent(id, planId, json, createdAt)`
- `Scenario(id, ownerId, label, profileJson, planId)`
- `ShareLink(id, planId, token, expiresAt)` (F12)
- `Partner(id, name, logoUrl, colors)` (F18, F20)

## Proposed additions (web app, 2026-09-28)

Added in `web/src/lib/schemas.ts`, marked `(proposed)` there:

- `BusinessProfile.assumed: string[]`: fields filled with defaults instead of the owner's answer. The UI shows them as "assumed" chips so the owner answers only what matters.
- `BusinessProfile.description`: the owner's own one-line description.
- `Jurisdiction.kind` adds `'out_of_area'` (outside Santa Clara County).
- `PermitRule`: `plainName`, `phase` (`before_lease | register | build | before_open | after_open`), `whatToDo: string[]`, `contact`, `feeNote`, `feePerPerson` (San José business tax formula), `kind: 'work'` (the owner's construction time), `gatesOpening` (false = can finish after opening), `scaleBySqft`.
- `CostRule.formula` adds `permit_fees` and `rent_until_open`, both read from the plan.
