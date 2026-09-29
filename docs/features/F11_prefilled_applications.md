# F11 — Pre-filled Applications

**Phase:** 4 (Stretch) · **Depends on:** F01, F03

## Summary
Uses the business profile to pre-fill the information needed for common applications, starting with the San José Business Tax Certificate registration. Produces either a filled PDF (if the official form is a fillable PDF) or a "copy-paste pack" matching each online form field, plus a checklist of documents to gather. The owner always reviews and submits themselves.

## User story
As an owner, I want my applications partially filled out from what I already told the tool, so I spend minutes, not hours, on paperwork.

## Why it matters
Converts guidance into action and saves real time; demonstrates the product doing work, not just advising.

## Scope
**MVP:** San José Business Tax Certificate data pack (start date, TIN placeholder, owner info, locations, seller's permit number, county health permit number if applicable — per the city's "what you need to register" list). Missing-info collection form. Output: printable summary + copyable fields.
**Later:** fillable PDFs for county/state forms, CDTFA seller's permit walkthrough, fictitious business name filing pack.

## Privacy & safety
- Never store SSN/TIN/driver's license numbers server-side in the hackathon; collect client-side only and render into the downloadable pack.
- Owner submits directly to the agency; we never submit on their behalf.

## Logic
- `ApplicationTemplate` JSON per form: fields → source (profile field, plan field, or "ask user"), help text, sourceUrl.
- Generate pack: known values filled, unknown flagged, dependencies noted ("You'll have your seller's permit number after completing: CDTFA seller's permit").

## UI
- From a permit card: "Prepare application" button.
- Form review screen with filled/unfilled indicators.
- Download as PDF / copy all.

## Build roadmap
- [ ] 1. Define `ApplicationTemplate` schema + SJ BTC template.
- [ ] 2. Field resolver from profile/plan.
- [ ] 3. Client-side sensitive field entry.
- [ ] 4. PDF generation (pdf-lib, or fill official fillable PDF if available).
- [ ] 5. Tests for resolver.

## Acceptance criteria
- Café profile generates a pack with all non-sensitive fields filled and sensitive fields entered client-side only.
- Dependencies on other permits are shown.

## Prompt to give Claude
> Build F11 per this file with an `ApplicationTemplate` system and the San José Business Tax Certificate pack. Keep sensitive identifiers client-side only.
