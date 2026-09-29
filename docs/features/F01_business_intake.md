# F01 — Business Intake

**Phase:** 1 (Core) · **Depends on:** shared data model · **Used by:** every other feature

## Summary
A fast, friendly flow that captures the owner's business idea and turns it into a validated `BusinessProfile`. It must feel like a 60-second conversation, not a government form. The owner can type freely ("I want to open a small coffee shop on Santa Clara Street, maybe sell pastries") or fill a short guided form; both paths produce the same structured profile. Sensible defaults fill anything the owner skips, and every default is visible and editable.

## User story
As a first-time owner, I want to describe my business in my own words and quickly see a plan, so I don't have to understand government terminology before I get value.

## Why it matters
Intake quality decides plan quality. Asking too much loses users; asking too little produces a wrong plan. The trick is: ask only the questions that change the permit path (food, alcohol, acquisition type, address) and default the rest.

## Scope
**MVP**
- Two entry modes: free-text box and a 5-step guided form.
- Required: business type, address. Strongly recommended: food service, alcohol, acquisition type.
- Optional: sq ft, seats, budget, target open date, entity type, vacancy of the space.
- Defaults per business type (see data model table).
- Review screen showing the parsed profile as editable chips before generating the plan.

**Out of scope (later)**
- Account creation / login (use anonymous IDs for the hackathon).
- Uploading floor plans or photos.

## Inputs / Outputs
- **Input:** free text and/or form values.
- **Output:** `BusinessProfile` (validated by zod) saved with an id → redirect to `/plan/[id]`.

## Logic
1. **Free-text path:** send text to Claude with a tool `extract_profile` whose input schema is the zod schema converted to JSON Schema (use `zod-to-json-schema`). The model fills only fields it is confident about.
2. Merge extracted fields over business-type defaults.
3. Detect missing *critical* fields (businessType, address, foodService for food-ish types, alcohol for cafe/restaurant). Ask at most 2 follow-up questions, as quick-reply buttons.
4. Call F02 to geocode and resolve jurisdiction before generating the plan.
5. Save profile, call `buildPlan`, redirect.

### Question design (guided form)
1. What are you opening? (café / restaurant / boutique / salon / other)
2. Where? (address autocomplete; allow "I haven't picked a space yet" → use neighborhood or cross streets)
3. Will you serve food? (no / packaged only / prepared on site)
4. Alcohol? (no / beer & wine / full bar)
5. Is the space: brand new build-out / was already a similar business / buying an existing business?

Then: "Anything else? (optional)" — sq ft, seats, budget, target date.

## UI
- Landing page: headline "Know before you sign the lease", one large text box with placeholder example, and a "Guide me step by step" link.
- Review screen: profile rendered as chips ("Café · Prepared food · No alcohol · Second-generation space · 1,200 sq ft"), each clickable to edit. Defaults marked with a subtle "assumed" label.
- Primary button: "Build my plan".

## API
- `POST /api/intake/parse` `{ text }` → `{ profile: Partial<BusinessProfile>, missing: string[], questions: Question[] }`
- `POST /api/plan` `{ profile }` → `{ planId }`

## Build roadmap
- [ ] 1. Implement zod `BusinessProfileSchema` + defaults helper `applyDefaults(type)`.
- [ ] 2. Build guided form (5 steps, progress dots, back button).
- [ ] 3. Build `/api/intake/parse` with Claude tool use; system prompt: "Extract only what the user stated. Never guess the address. Return null for unknown fields."
- [ ] 4. Missing-field detector + follow-up quick replies.
- [ ] 5. Review screen with editable chips.
- [ ] 6. Wire to F02 geocoding and `POST /api/plan`.
- [ ] 7. Seed 3 demo presets (café downtown SJ, boutique in Willow Glen, restaurant change-of-ownership) as one-click buttons for the demo.

## Acceptance criteria
- "Coffee shop at 100 W Santa Clara St San Jose, pastries, no alcohol" → profile with `cafe`, `prepared_food`, `none`, correct address, in one step without follow-ups.
- Leaving everything optional blank still produces a valid profile.
- The review screen shows which values were assumed.
- Invalid values (negative sq ft) are rejected with a friendly message.

## Edge cases
- Address outside Santa Clara County → allow, but F02 marks `supported: false`; show a friendly message.
- "Food truck" or "home bakery" → map to `other`, show "Not fully supported yet" but still produce general state items.
- User types in Spanish/Vietnamese → extraction still works; set `language` accordingly (F17).

## Tests
- Unit: `applyDefaults` for each type.
- Unit: schema rejects unknown fields and bad enums.
- LLM eval: 15 sample descriptions → expected profiles (check field accuracy ≥ 90%).

## Prompt to give Claude
> Build F01 Business Intake per this file, the overview, and the shared data model. Use Next.js App Router, Tailwind, zod, and the Anthropic SDK tool use for `/api/intake/parse`. Include the 3 demo presets. Write Vitest tests for defaults and schema validation.
