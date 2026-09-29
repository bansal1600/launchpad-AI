# F10 — Lease Red-Flag Check

**Phase:** 4 (Stretch) · **Depends on:** F02, F03, F04, F05

## Summary
Before signing, the owner pastes lease terms (or uploads the lease PDF / letter of intent) and describes the space. The tool checks it against their plan and flags risks: use clause that doesn't match the business, no rent abatement during the permit period the timeline predicts, missing contingency for permit denial, space lacking what the business type needs (e.g., grease interceptor, hood for a café with cooking), who pays for tenant improvements, and personal guarantee terms. Output is a checklist of questions to ask the landlord or an attorney — not legal advice.

## User story
As an owner about to sign, I want to know which lease terms could hurt me given my plan, so I can negotiate before I'm locked in.

## Why it matters
The lease is the moment of irreversible commitment. Connecting the lease to the plan's predicted timeline ("your plan needs ~5 months; this lease gives 1 free month") is uniquely valuable.

## Scope
**MVP:** paste text or upload PDF; extract key terms with Claude into a structured `LeaseTerms` object; run deterministic checks; show flags with severity and suggested questions.
**Later:** clause-level redline suggestions, broker view.

## Data model (propose adding to shared model)
```ts
LeaseTerms {
  permittedUse?: string
  rentStartDate?: string
  freeRentMonths?: number
  monthlyRentUsd?: number
  termMonths?: number
  tiAllowanceUsd?: number
  contingencies?: string[]        // permit, financing
  personalGuarantee?: boolean
  exclusiveUse?: boolean
  assignmentAllowed?: boolean
}
```

## Checks (deterministic, each with severity)
| Check | Rule |
|---|---|
| Rent vs permit period | freeRentMonths × 30 < timeline.totalDays.typical → HIGH |
| No permit contingency | contingencies lacks permit/approval → HIGH |
| Use clause mismatch | LLM classification of permittedUse vs businessType → HIGH if mismatch |
| Food infrastructure | prepared_food and lease/space notes lack hood/grease interceptor → MEDIUM ("ask landlord") |
| TI allowance vs buildout cost | tiAllowance < costs.buildout.typical × 0.3 → MEDIUM |
| Personal guarantee | true → INFO with explanation |
| No exclusive-use clause + high saturation (F06) | MEDIUM |

## UI
- Upload/paste box → extracted terms table (editable, to correct extraction errors).
- Flags list with severity color, explanation, and "Question to ask".
- "Copy questions for my landlord/attorney" button.
- Clear disclaimer.

## Build roadmap
- [ ] 1. Add `LeaseTerms` schema.
- [ ] 2. PDF text extraction (pdf-parse) + Claude extraction via tool with schema.
- [ ] 3. Implement checks as pure functions using plan data.
- [ ] 4. UI + copy-to-clipboard.
- [ ] 5. Tests with 3 sample lease snippets.

## Acceptance criteria
- Sample lease with 1 free month against a 5-month plan → HIGH flag citing both numbers.
- Extraction editable before checks run.

## Edge cases
- Scanned PDF without text → ask user to paste key terms.
- Missing fields → flag as "Not found — ask about this".

## Prompt to give Claude
> Build F10 per this file: schema, extraction via tool use, deterministic checks referencing the current plan, and the flags UI with copyable questions. Never phrase output as legal advice.
