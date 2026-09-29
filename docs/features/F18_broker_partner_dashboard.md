# F18 — Broker & Partner Dashboard

**Phase:** Roadmap (B2B) · **Depends on:** F09, F12, F19 · **Pairs with:** F20

## Summary
A workspace for commercial real estate brokers, business associations, SBDC advisors, lenders, and city staff to manage many clients and properties: create plans on behalf of clients, compare properties for a client's concept, track which clients are stuck in permitting, and share branded plans. This is the paying-customer product.

## User story
As a retail leasing broker, I want to quickly show a prospective tenant what it takes to open their concept in my listing, so they sign sooner and with confidence.
As an SBDC advisor, I want to see all my clients' plans and who is stuck, so I can prioritize help.

## Why it matters
Founders open a business once; partners see new businesses every week. This is the revenue model (per-seat or per-listing subscription).

## Scope
**MVP (post-hackathon):** organizations + members (auth via Clerk/Auth.js), clients list, create plan for a client, properties list (addresses), run property-first analysis (F19) per listing, client/property matching, pipeline view by permit progress (uses F13).
**Later:** CRM integrations, usage analytics, API access.

## Data model (propose)
- `Organization(id, name, type: 'broker'|'association'|'sbdc'|'lender'|'city', brandingId)`
- `Member(orgId, userId, role)`
- `Client(id, orgId, name, contact, profileIds[])`
- `Property(id, orgId, address, sqft, groundFloor, vacantSince, askingRent, notes)`

## Key views
1. **Properties:** each listing with top-fit business types (F19) and incentive flags.
2. **Clients:** each client with their plans, status, projected open date.
3. **Match:** pick a client concept → rank org's properties by open date, cost, saturation, incentives.
4. **Pipeline:** clients by stage (planning / leasing / permitting / opened), overdue alerts.

## Build roadmap
- [ ] 1. Auth + organizations + roles.
- [ ] 2. Properties CRUD with CSV import.
- [ ] 3. Clients CRUD linking to profiles/plans.
- [ ] 4. Match view (reuse F09 comparison logic across properties).
- [ ] 5. Pipeline view (requires F13).
- [ ] 6. Share with branding (F20).

## Acceptance criteria
- Broker imports 10 listings via CSV and sees fit analysis for each in < 30 s.
- Client × property match ranks correctly by chosen metric.

## Prompt to give Claude
> Build F18 per this file: organizations with roles, properties and clients, a client-to-property match view reusing scenario comparison, and a pipeline view.
