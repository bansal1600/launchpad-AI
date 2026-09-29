# F07 — Incentive Finder

**Phase:** 3 (Core) · **Depends on:** F01, F02 · **Used by:** F08, F09, F19

## Summary
Matches the business and location against grants, fee waivers, loan programs, and free advisory services, and explains why each one matches (or what's missing to qualify). Money the owner didn't know about is the most memorable value in the whole product.

## User story
As an owner, I want to know which programs I qualify for at this location, so I don't leave free money or free help on the table.

## Why it matters
Programs like San José's Storefront Activation Grants exist but are poorly discovered. Location-dependent eligibility (e.g., a ground-floor space vacant for more than three months) makes this a great demo: switching address can gain or lose a grant.

## Scope
**MVP seed incentives (verify current status and amounts before demo):**
| Rule id | Provider | Eligibility idea |
|---|---|---|
| `sj_vacant_storefront_grant` | City of San José OEDCA | Small business leasing ground-floor space vacant > 3 months |
| `sj_existing_storefront_grant` | City of San José OEDCA | Existing ground-floor small retail improving exterior |
| `sj_small_business_ally` | City of San José | Free permitting help — always show for SJ |
| `sbdc_advising` | Silicon Valley SBDC | Free advising — always show |
| `sba_loan_programs` | U.S. SBA | Informational: 7(a), 504, microloans |
| `ca_ibank_small_business_loans` | CA IBank | Informational (verify) |
| `sj_downtown_assistance` | San José Downtown Association | Downtown addresses (optional polygon check) |

Each item has `status` (`active` / `paused` / `unknown`) — **always verify before demo**; never present a paused program as available.

**Later:** federal Opportunity Zones and HUBZone lookups by tract, ADA/CASp-related grants, workforce hiring incentives.

## Logic
```
for rule in incentiveRules where jurisdiction matches:
  if jsonLogic(eligibleWhen, profile)        -> 'eligible'
  elif jsonLogic(likelyEligibleWhen, profile)-> 'may_qualify' + missing info
reasons = template from conditions ("Ground-floor space ✓", "Vacant 5 months ✓ (needs > 3)")
missing = conditions referencing undefined profile fields -> "Tell us how long the space has been vacant"
```
- "Missing info" prompts become one-tap chat questions in F08.

## UI
- Card list: name, provider, value description, match badge (Eligible / May qualify), reasons with ✓ / ✗ / ?, "How to apply", source link, last verified date.
- Header: "You may qualify for up to $X in grants and fee waivers" (sum only `eligible` items with numeric values).
- Status badge: "Program status: verify with provider" if `unknown`.

## API
- `plan.incentives` from engine.

## Build roadmap
- [ ] 1. Research and write incentive JSON files (with status + lastVerified).
- [ ] 2. Implement `matchIncentives()` with eligible / may_qualify / missing logic.
- [ ] 3. Reason and missing-info templates.
- [ ] 4. Incentive cards UI + total header.
- [ ] 5. Hook "missing info" to chat quick replies.
- [ ] 6. Tests.

## Acceptance criteria
- Café, ground floor, vacant 6 months, San José → vacant storefront grant `eligible`.
- Same with vacancy unknown → `may_qualify` with prompt "How long has the space been vacant?"
- Switching to Sunnyvale (F08) → San José incentives appear in `incentivesLost` in the diff.

## Edge cases
- Program paused → hide from totals, show under "Currently unavailable".
- Amount unknown → show description, exclude from total.

## Tests
- Matching unit tests for each seed rule.

## Prompt to give Claude
> Build F07 per this file. Seed incentive JSON with `status: 'unknown'` and TODOs for amounts, implement `matchIncentives` with reasons and missing-info prompts, and build the incentive cards UI.
