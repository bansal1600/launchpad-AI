# F08 — Conversational Plan Editing  ⭐ demo centerpiece

**Phase:** 2 (Core) · **Depends on:** F01–F05 (F06, F07 plug in later) · **Used by:** F09, F13, F17

## Summary
A chat panel beside the plan where the owner describes changes in plain language — "add beer and wine," "actually I'm buying my cousin's taqueria," "what about Sunnyvale?", "my budget is only $150K," "I need to open by March" — and the entire plan (permit list, timeline chart, cost chart, competitors, incentives) updates in seconds with a clear **"What changed"** card. The chat also answers questions about the plan ("why do I need a seller's permit?") grounded in the rule data.

## User story
As an owner, I want to explore "what if" decisions by just talking, so I can see the consequences in time and money before committing.

## Why it matters
This is what separates the product from static lists and PDFs: a living plan. It also creates long-term engagement (the owner returns as their plans change) and is the most compelling 20 seconds of the demo.

## Core design rule
**The LLM edits the profile, never the plan.** Flow:
```
user message
  -> Claude (with tools) decides: update_profile | answer_question | ask_clarification
  -> update_profile(patch) validated by zod (ProfilePatch)
  -> if address changed: re-run F02 jurisdiction
  -> buildPlan(newProfile)  (full recompute)
  -> diffPlans(oldPlan, newPlan) -> PlanDiff
  -> humanSummary from diff (deterministic template)
  -> Claude writes a short friendly explanation using ONLY the diff + plan data
  -> UI animates changes
```

## Tools exposed to Claude
```ts
update_profile({ patch: ProfilePatch, reason: string })
ask_clarification({ question: string, options?: string[] })   // max 1 per turn
explain_item({ ruleId: string })     // returns rule data for grounded answers
compare_scenarios({ ... })           // F09, later
```

### System prompt essentials
- You help a small-business owner in Santa Clara County adjust their launch plan.
- You may only change the plan by calling `update_profile` with fields from the schema.
- Never state permit names, fees, durations, or grant amounts unless they appear in tool results or the current plan JSON provided.
- If a request is ambiguous in a way that changes permits (e.g., "sell some food" → packaged vs prepared), call `ask_clarification` with options.
- Keep replies to 2–4 sentences; the UI shows the details.
- This is guidance, not legal advice.

Provide the current profile and a compact plan summary (permit ids + names, totals, incentives) in context each turn.

## Supported changes (MVP — do these 6 extremely well)
| Owner says | Patch | Visible result |
|---|---|---|
| "Add beer and wine" | `alcohol: 'beer_wine'` | ABC license added, timeline longer, fees up |
| "Make it a boutique instead" | `businessType, foodService: 'none'` | Health permits removed, costs drop, competitor set changes |
| "I'm buying an existing restaurant" | `acquisition: 'change_of_ownership'` | Change-of-ownership evaluation added, plan check removed |
| "What about [new address]?" | `address.raw` (triggers F02) | Jurisdiction/competitors/incentives change |
| "Budget is $150K" | `budgetUsd: 150000` | Over/under budget flag, suggestions |
| "Need to open by March 1" | `targetOpenDate` | Meets/misses target, critical path emphasized |

## PlanDiff → human summary (deterministic)
```
"+1 permit (Alcohol license) · Opening +6 weeks (May 12 → Jun 23) · +$4,200 typical · No change to grants"
```
Built by `diffPlans()`; the LLM may rephrase but the numbers are always rendered from the diff object in the UI card.

## UI
- Right-side chat panel (bottom sheet on mobile).
- Suggested prompt chips: "Add beer & wine", "Try another address", "What's my biggest risk?", "Why do I need this permit?"
- After each change: "What changed" card pinned in the chat with the diff, plus **Undo** button.
- Plan sections animate: new permit cards slide in with a "New" tag, removed ones fade with strikethrough for 2 s, timeline bars animate, cost total counts up/down.
- Version history dropdown ("v3 — Added beer and wine").

## API
- `POST /api/chat` `{ planId, message }` → `{ reply, newPlan?, diff?, clarification? }`
- `POST /api/plan/:id/undo` → previous version.
- Stream the text reply; send plan/diff as a final JSON event (or a second request).

## Build roadmap
- [ ] 1. Implement `diffPlans()` and `humanSummary()` with unit tests (do this first, no LLM needed).
- [ ] 2. Version storage: every change saves a new Plan version + ChangeEvent.
- [ ] 3. Chat agent with tool definitions generated from zod schemas; validate every patch, reject unknown fields.
- [ ] 4. Re-run F02 when address changes.
- [ ] 5. Chat UI + suggested chips + "What changed" card + undo.
- [ ] 6. Plan animations driven by `PlanDiff`.
- [ ] 7. Grounded Q&A via `explain_item`.
- [ ] 8. Eval set: 30 owner messages → expected patch (or clarification). Target ≥ 90% correct.

## Acceptance criteria
- All 6 supported changes work end-to-end in < 5 s.
- "Sell some food" triggers a clarification with options, not a guess.
- Undo restores the exact previous plan (deep-equal).
- LLM reply never contains a fee or duration not present in the plan (spot-check in eval).
- Off-topic or unsupported requests get a polite, helpful answer without breaking the plan.

## Edge cases
- Multiple changes in one message ("beer and wine, and move to Willow Glen") → single combined patch, single diff.
- Contradictions ("boutique with a full kitchen") → ask clarification.
- Tool call fails validation → reply "I couldn't apply that change" + show what was understood.

## Tests
- Unit: diff for each supported change using fixture plans.
- Integration: mock LLM returning fixed tool calls → verify plan + diff.
- Eval script for real model.

## Prompt to give Claude
> Build F08 per this file. Start with `diffPlans` + `humanSummary` and tests, then plan versioning and undo, then the chat agent with zod-validated tool calls, then the UI with the "What changed" card and animations. Include the 30-message eval script.
