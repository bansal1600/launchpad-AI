# F12 — Shareable Plan Link

**Phase:** 4 (Stretch) · **Depends on:** F03–F07 · **Used by:** F18, F20

## Summary
A clean, read-only web version of the plan (or a scenario comparison) that the owner can send to a business partner, lender, broker, landlord, or the city's Small Business Ally. Includes all sections, sources, and last-verified dates, plus a print-friendly/PDF layout. Links can expire or be revoked.

## User story
As an owner, I want to share my plan with my partner and my lender without them needing an account.

## Why it matters
Sharing spreads the product (every shared plan is marketing) and makes it useful in real conversations with lenders and landlords.

## Scope
**MVP:** create link (random token), read-only view, print stylesheet, revoke, optional expiry.
**Later:** comments, view analytics for brokers, password protection.

## Logic
- `ShareLink(id, planId, token, expiresAt, revoked)`; token = 128-bit random, URL `/s/[token]`.
- Shared view renders a **snapshot** of the plan version at share time (so later edits don't surprise the viewer), with a note "Plan as of {date}, version {n}".
- No chat, no edit controls in shared view.

## UI
- "Share" button → modal: copy link, expiry dropdown (7/30 days/never), revoke.
- Shared page: header with business name, summary stats, then sections; footer with disclaimer and "Build your own plan" CTA.
- `@media print` styles for clean PDF via browser print.

## Build roadmap
- [ ] 1. ShareLink table + create/revoke API.
- [ ] 2. Read-only plan view reusing components with `readOnly` prop.
- [ ] 3. Print stylesheet.
- [ ] 4. Expiry handling + 404 page for revoked/expired.

## Acceptance criteria
- Link opens in an incognito window without login.
- Revoked link returns a friendly "no longer available" page.
- Printed output fits cleanly on letter-size pages.

## Prompt to give Claude
> Build F12 per this file with snapshot-based read-only sharing, revoke/expiry, and a print stylesheet.
