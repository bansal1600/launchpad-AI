# Launchpad AI

**Comply Cofounder: know before you sign the lease.**

A planner for people opening a physical business (café, restaurant or retail boutique) in Santa Clara County, California. The owner enters a business type and an address; everything else comes from a conversation. The app returns:

- **Who regulates the address**: city, unincorporated county, or out of area (US Census geocoder)
- **A roadmap** of every city, county, state and federal step, grouped into waves you can work on in parallel, with a calendar view, documents checklist, official links, office hours, and who can help
- **A realistic opening date** and critical path
- **A startup cost estimate**, including rent paid while waiting on permits
- **The neighborhood**: Census demographics, transit, parking, bike share, nearby businesses and real competitors on an interactive map
- **Grants and free help** the owner may qualify for
- **A chat** that updates the plan live and shows each planning step and what changed

Rules cover San José and Sunnyvale in detail, and county, state and federal steps anywhere in Santa Clara County. Each rule links to its official source; values checked against the source are marked with the check date.

## Repository layout

```
web/                       Next.js app (the product)
  src/app/                 pages and API routes (chat, geocode, neighborhood, competitors)
  src/components/          UI by area: layout, plan, location, chat, ui
  src/lib/engine/          pure planning engine: buildPlan, diff, waves, geo
  src/lib/services/        outside data: Census geocoder, OpenStreetMap places, Census Reporter
  src/lib/llm/             chat agent (OpenAI or Claude) with the update_profile tool
  src/rules/               permits, costs and incentives as JSON rules (all plan facts live here)
  src/data/                directory of free help and sample local vendors
  tests/unit/              engine and chat-agent tests (vitest)
docs/                      product overview, shared data model, feature specs F01–F20
prototypes/                earlier Streamlit food-truck demo (TruckComply)
```

## Run it

```bash
cd web
npm install
cp .env.example .env.local   # add an OpenAI or Anthropic key for the full chat
npm run dev                  # http://localhost:3000
npm test
```

## Data sources

- Permits, fees and processes: City of San José, City of Sunnyvale, County of Santa Clara (Environmental Health, Clerk-Recorder), CA Secretary of State, CDTFA, EDD, ABC, IRS. Links are in `web/src/rules/permits.json`.
- Address to jurisdiction: US Census Geocoder.
- Demographics: US Census Bureau American Community Survey, via Census Reporter.
- Places, transit, parking and competitors: © OpenStreetMap contributors.

This is guidance based on public sources, not legal advice. Confirm with the issuing agency before acting.
