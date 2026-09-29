# Comply Cofounder (web app)

Tell it what you're opening and where. It returns every city, county, state and federal step in order, a realistic opening date, a startup budget, nearby competitors and grants, all written for a first-time owner. Change anything by chatting and see exactly what changed.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine unit tests
```

Copy `.env.example` to `.env.local` (restart `npm run dev` after editing):

```
OPENAI_API_KEY=sk-...          # use OpenAI for the chat
OPENAI_MODEL=gpt-5.5           # optional; any chat model your account can use
ANTHROPIC_API_KEY=...          # or use Claude (claude-opus-5-5)
CHAT_PROVIDER=openai           # optional: force openai | anthropic | local when both keys are set
COMPLY_LOCAL_ONLY=1            # optional: force the offline keyword parser
```

With no key, the chat falls back to a keyword parser.

## How it fits together

- `src/rules/*.json`: permits, costs, incentives. **All plan facts live here.** Each permit has a plain-language name, phase, "what to do" steps, contact, official source link and `verified`/`lastVerified`.
- `src/lib/engine/buildPlan.ts`: pure `buildPlan(profile)`. Selects rules by jurisdiction + json-logic, schedules by dependencies (fast/typical/slow), finds the critical path, estimates costs (rent while waiting comes from the timeline), matches incentives.
- `src/lib/engine/diff.ts`: `diffPlans` + `humanSummary` for the "What changed" card. Numbers always come from here.
- `src/lib/services/geocode.ts`: US Census geocoder → city / unincorporated / out-of-area.
- `src/lib/services/places.ts`, `neighborhood.ts`: OpenStreetMap places and Census Reporter demographics.
- `src/lib/llm/chatAgent.ts`: the `update_profile` tool, the shared executor and prompt, provider selection, and the Claude loop.
- `src/lib/llm/openaiChat.ts`: the same loop on OpenAI chat completions. Neither model writes plan facts.
- `src/lib/localParser.ts`: deterministic fallback with the same output shape.
- `src/lib/defaults.ts`: fills everything the owner didn't say and records it as `assumed`.

## Minimal intake, then chat

The owner gives two things: business type and address. Everything else starts as a typical default for that type (shown read-only as "Assuming for now") and gets filled in by talking.

`/api/chat` streams NDJSON events. The model (OpenAI or Claude) runs a tool loop with one tool, `update_profile`. Each call is validated with zod, applied (geocoding when the address changes), and the rebuilt plan is sent to the browser immediately as an `update` event, so the plan changes while Claude is still replying. The tool result gives Claude the exact diff and the new plan, so its explanation uses engine numbers only. Without an API key the same route runs the keyword parser (`localParser.ts`) and asks the next most useful question (`nextQuestion.ts`).

## Data status (checked 2026-09-28)

Checked against official pages: San José business tax rates and 90-day registration rule, County DEH plan review process and inspections, change-of-ownership rule, Streamlined Restaurant Program criteria and timeline, ABC 2026 application fees and process, CDTFA seller's permit, EDD registration, County FBN fee, the 60-day food safety certificate rule, and the Vacant/Existing Storefront grants. Rules not yet checked, and fees that are estimates (DEH plan check and permit fees, building permit fees), are marked **Needs verification** or carry a `feeNote` in the UI.

Some official sites (sanjoseca.gov, santaclaracounty.gov) block automated downloads; they were read via the Internet Archive or search. Re-check the DEH fee schedule by hand: https://deh.santaclaracounty.gov/environmental-health-fee-adjustment-2026

## Location data (F06)

`/api/neighborhood` and `/api/competitors` read OpenStreetMap (Overpass API) and Census Reporter at request time and cache per location. The busy-hours chart is a model built from nearby places, not a measured count. County health inspection scores are the next data source to add.
