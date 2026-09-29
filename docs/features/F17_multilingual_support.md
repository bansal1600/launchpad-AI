# F17 — Multilingual Support

**Phase:** Roadmap (quick win possible during hackathon) · **Depends on:** F01, F08

## Summary
Full experience in English, Spanish, Vietnamese, and Chinese (Simplified and Traditional) — major languages among San José small business owners. The chat understands and responds in the owner's language; UI strings are translated; permit names show the official English name plus a translated explanation so owners can still find the right form at the agency.

## User story
As an owner more comfortable in Vietnamese, I want to understand my plan in Vietnamese while still knowing the official English names of each permit.

## Why it matters
San José's own Small Business Ally program emphasizes bilingual help. Language is a real barrier for immigrant entrepreneurs, and this is a strong equity story for judges and city partners.

## Scope
**Hackathon quick win:** chat auto-detects language and replies in it; plan explanations translated on the fly by Claude (rule facts unchanged).
**Full version:** i18n for UI (next-intl), human-reviewed translations of rule `shortDescription` and `howToApply`, language switcher, translated shareable plans and reminders.

## Rules
- Never translate official permit names without also showing the English original.
- Numbers, dates, and fees come from the engine; only prose is translated.
- Machine-translated rule text shows "Machine translated" until human-reviewed.

## Data model
- `BusinessProfile.language` (already present).
- Rule files: optional `i18n: { es?: {...}, vi?: {...}, zh?: {...} }` for reviewed text (propose).

## Build roadmap
- [ ] 1. Chat: language detection + system prompt "Reply in the user's language; keep official permit names in English in parentheses."
- [ ] 2. next-intl setup; extract UI strings.
- [ ] 3. Translation pipeline script for rule prose → review queue.
- [ ] 4. Language switcher + persistence on profile.
- [ ] 5. Right-to-left not required for these languages; test font rendering for Vietnamese diacritics and Chinese.

## Acceptance criteria
- "Tôi muốn mở một quán cà phê ở San Jose" produces a café profile and a Vietnamese reply.
- Permit cards show "Seller's Permit (Giấy phép bán hàng)" style dual labels.

## Prompt to give Claude
> Build F17 per this file: start with the chat language quick win, then next-intl UI translation and dual-language permit labels.
