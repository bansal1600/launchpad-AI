# F14 — Deadline & Renewal Reminders

**Phase:** Roadmap · **Depends on:** F03, F13

## Summary
After (and before) opening, the product reminds owners of time-sensitive obligations: registration windows (e.g., San José requires Business Tax Certificate registration within 90 days of starting business), annual renewals, sales tax filing periods, health permit renewals, inspection windows, and fictitious business name renewals. Reminders by email (and later SMS), plus an .ics calendar export.

## User story
As a busy owner, I want to be reminded before deadlines so I never pay penalties or risk my permits.

## Why it matters
Keeps the product valuable after opening day, which fixes the "one-time customer" problem and supports a subscription model.

## Scope
**MVP:** `DeadlineRule` JSON (relative to events like business start date or approval date), generated deadline list, .ics export, email reminders (Resend or similar) at 30/7/1 days.
**Later:** SMS, multilingual reminders (F17), partner-branded reminders (F20).

## Data model (propose)
```ts
DeadlineRule {
  id, name, relatedRuleId?, anchor: 'business_start' | 'approval_date' | 'fixed_annual',
  offsetDays?: number, recurrence?: 'annual' | 'quarterly' | 'monthly',
  appliesWhen: JsonLogic, sourceUrl, verified
}
Deadline { id, profileId, ruleId, dueDate, status: 'upcoming'|'done'|'missed' }
```

## Build roadmap
- [ ] 1. Deadline rules for SJ BTC (90-day registration, annual renewal), health permit renewal, FBN renewal, sales tax filing (frequency assigned by CDTFA — ask user).
- [ ] 2. Deadline generator + tests.
- [ ] 3. .ics export.
- [ ] 4. Email scheduler (cron job / queue).
- [ ] 5. UI: upcoming deadlines widget.

## Acceptance criteria
- Setting a business start date generates the 90-day BTC registration deadline correctly.
- .ics imports into Google Calendar and Outlook.

## Prompt to give Claude
> Build F14 per this file: DeadlineRule schema, generator, .ics export, and an email reminder job, with rules sourced and marked verified/unverified.
