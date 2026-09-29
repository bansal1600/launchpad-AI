# F20 — Branded Reports

**Phase:** Roadmap (B2B) · **Depends on:** F12, F18

## Summary
Partners (brokers, associations, lenders, cities) share plans and property-fit reports with their own logo, colors, contact details, and an optional intro note, so the product feels like part of their service. Includes a "Powered by" footer that drives awareness.

## User story
As a broker, I want to send prospective tenants a professional plan under my brokerage's brand, so it strengthens my relationship with them.

## Why it matters
White-labeling increases partner willingness to pay and makes every shared report a lead generator.

## Scope
**MVP:** org branding settings (logo upload, primary color, contact block, disclaimer addendum), applied to shared links (F12) and print/PDF; per-share intro note.
**Later:** custom domains, fully white-labeled footer for enterprise tier.

## Data model (propose)
- `Branding(id, orgId, logoUrl, primaryColor, accentColor, contactName, contactEmail, contactPhone, footerNote)`
- `ShareLink.brandingId?`, `ShareLink.introNote?`

## Rules
- Color contrast must meet WCAG AA; auto-adjust text color on brand backgrounds.
- The source links, verification dates, and disclaimer are always shown — branding can't hide them.

## Build roadmap
- [ ] 1. Branding settings page + logo upload (store as data URL or object storage).
- [ ] 2. Theme tokens applied to shared view and print stylesheet.
- [ ] 3. Intro note on share.
- [ ] 4. Contrast checker.
- [ ] 5. "Powered by" footer toggle by plan tier.

## Acceptance criteria
- Shared link shows partner logo, colors, and contact; printed PDF matches.
- Disclaimer and sources remain visible under any branding.

## Prompt to give Claude
> Build F20 per this file: branding settings, themed shared/printed views with contrast checks, and intro notes, without ever hiding sources or disclaimers.
